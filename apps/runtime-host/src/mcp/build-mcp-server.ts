import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeTool, renderErrorMarkdown, type FetchGuard, type ServerSpec, type ToolSpec } from "@mcp-foundry/spec";
import { buildCacheKey, type TtlCache } from "../cache/index.js";
import type { CircuitBreakerRegistry } from "../limits/circuit-breaker.js";
import type { ConcurrencyLimiter } from "../limits/concurrency-limiter.js";
import { toZodShape } from "./schema-to-zod.js";

const ERROR_MARKDOWN_PREFIX = "**Error:**";
const BREAKER_OPEN_MESSAGE = renderErrorMarkdown(
  "This server is temporarily unavailable after repeated upstream failures. Please try again shortly.",
);

export interface BuildMcpServerDeps {
  cache: TtlCache;
  circuitBreakers: CircuitBreakerRegistry;
  concurrency: ConcurrencyLimiter;
  fetchGuard: FetchGuard;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Runs one tool call with every v1-required hardening layer wired in, in
 * order: circuit breaker (fail fast for a tenant with a known-bad
 * upstream) -> cache (readOnly + cacheTtlSeconds tools only, R4-keyed) ->
 * concurrency limiter (per-tenant slot) -> the interpreter itself.
 */
async function runToolCall(
  slug: string,
  tool: ToolSpec,
  args: Record<string, unknown>,
  deps: BuildMcpServerDeps,
): Promise<{ markdown: string; failed: boolean }> {
  if (deps.circuitBreakers.isOpen(slug)) {
    return { markdown: BREAKER_OPEN_MESSAGE, failed: true };
  }

  const cacheKey =
    tool.annotations.readOnlyHint && tool.cacheTtlSeconds !== undefined
      ? buildCacheKey(slug, tool.name, args)
      : null;
  if (cacheKey) {
    const cached = deps.cache.get(cacheKey);
    if (cached !== undefined) return { markdown: cached, failed: false };
  }

  const release = await deps.concurrency.acquire(slug);
  try {
    const markdown = await executeTool(tool, args, {
      fetchGuard: deps.fetchGuard,
      timeoutMs: deps.timeoutMs,
      maxResponseBytes: deps.maxResponseBytes,
    });
    const failed = markdown.startsWith(ERROR_MARKDOWN_PREFIX);

    if (failed) deps.circuitBreakers.recordFailure(slug);
    else deps.circuitBreakers.recordSuccess(slug);

    if (cacheKey && !failed && tool.cacheTtlSeconds !== undefined) {
      deps.cache.set(cacheKey, markdown, tool.cacheTtlSeconds);
    }

    return { markdown, failed };
  } finally {
    release();
  }
}

/** Builds one McpServer instance exposing every tool declared by `spec`,
 * with the full v1 hardening path (egress guard, resource caps, per-tenant
 * concurrency + circuit breaker, R4 cache) wired into each tool call. */
export function buildMcpServer(spec: ServerSpec, deps: BuildMcpServerDeps): McpServer {
  const server = new McpServer({ name: spec.slug, version: "1.0.0" });

  for (const tool of spec.tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: toZodShape(tool.inputSchema),
        annotations: tool.annotations,
      },
      async (args) => {
        const { markdown, failed } = await runToolCall(spec.slug, tool, args as Record<string, unknown>, deps);
        return { content: [{ type: "text" as const, text: markdown }], isError: failed || undefined };
      },
    );
  }

  return server;
}
