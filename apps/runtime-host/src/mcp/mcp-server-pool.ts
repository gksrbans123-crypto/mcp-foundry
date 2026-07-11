import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { FetchGuard, ServerSpec } from "@mcp-foundry/spec";
import { createGuardedFetch } from "../egress/guarded-fetch.js";
import type { ResolveHost } from "../egress/resolve-host.js";
import type { SendPinnedRequest } from "../egress/send-pinned-request.js";
import type { CircuitBreakerRegistry } from "../limits/circuit-breaker.js";
import type { ConcurrencyLimiter } from "../limits/concurrency-limiter.js";
import type { TtlCache } from "../cache/ttl-cache.js";
import type { SpecRegistry } from "../registry/types.js";
import { buildMcpServer } from "./build-mcp-server.js";

export interface McpServerPoolDeps {
  registry: SpecRegistry;
  toolCache: TtlCache;
  circuitBreakers: CircuitBreakerRegistry;
  concurrency: ConcurrencyLimiter;
  /** Process-wide egress allowlist (EGRESS_ALLOWLIST env). Empty/unset = no
   * extra restriction beyond each spec's own declared hosts. */
  globalEgressAllowlist?: readonly string[];
  timeoutMs?: number;
  maxResponseBytes?: number;
  /** How long a resolved spec/fetchGuard is reused before re-reading it from
   * the registry. Bounds how long a status change (dashboard disable/enable,
   * delete, or a refine) takes to show up on an already-hit slug — without it
   * the per-slug cache never re-checks the DB status gate. Default 15s. */
  resolvedTtlMs?: number;
  /** Test-only seams forwarded into createGuardedFetch; left undefined in
   * production so the real DNS-validation + pinned-socket implementations
   * are used (see egress/resolve-host.ts, egress/send-pinned-request.ts). */
  resolveHost?: ResolveHost;
  sendRequest?: SendPinnedRequest;
}

interface ResolvedSlug {
  spec: ServerSpec;
  fetchGuard: FetchGuard;
}

interface CachedSlug extends ResolvedSlug {
  resolvedAt: number;
}

const DEFAULT_RESOLVED_TTL_MS = 15_000;

/**
 * Resolves and caches the per-slug pieces that are safe to share across
 * concurrent requests (the spec lookup and the egress-guard closure, since
 * `FetchGuard` itself carries no per-connection state), then builds a
 * *fresh* McpServer for every request.
 *
 * A single long-lived McpServer per slug was the original design here, but
 * it is unsafe under real concurrency: the MCP SDK's underlying
 * `Protocol.connect()` throws ("Already connected to a transport...") if
 * called again before the previous transport has fully closed. Two
 * requests to the *same* slug arriving close together — exactly what
 * ConcurrencyLimiter is meant to allow — would race on that single shared
 * instance. Reproduced directly against the SDK (two concurrent
 * `tools/call` requests with an artificially slow upstream) before landing
 * this fix; see the git history for the failing repro. `buildMcpServer`
 * itself does no I/O (only tool registration), so building it fresh per
 * request is cheap.
 */
export class McpServerPool {
  private readonly resolved = new Map<string, CachedSlug>();
  private readonly resolvedTtlMs: number;

  constructor(private readonly deps: McpServerPoolDeps) {
    this.resolvedTtlMs = deps.resolvedTtlMs ?? DEFAULT_RESOLVED_TTL_MS;
  }

  private async resolve(slug: string): Promise<ResolvedSlug | null> {
    const cached = this.resolved.get(slug);
    if (cached && Date.now() - cached.resolvedAt < this.resolvedTtlMs) {
      return { spec: cached.spec, fetchGuard: cached.fetchGuard };
    }

    const spec = await this.deps.registry.get(slug);
    if (!spec) {
      // Drop any stale entry so a now-disabled/deleted slug stops being served.
      this.resolved.delete(slug);
      return null;
    }

    // Allowed hosts are computed once from the spec's own (trusted, not
    // caller-influenced) urlTemplates — see packages/spec's URL_TEMPLATE_
    // PATTERN, which guarantees the host segment can never contain a
    // {param} placeholder in the first place.
    const allowedHosts = new Set(spec.tools.map((tool) => new URL(tool.request.urlTemplate).hostname.toLowerCase()));
    const fetchGuard = createGuardedFetch({
      allowedHosts,
      globalAllowlist: this.deps.globalEgressAllowlist,
      resolveHost: this.deps.resolveHost,
      sendRequest: this.deps.sendRequest,
    });

    const config: ResolvedSlug = { spec, fetchGuard };
    this.resolved.set(slug, { ...config, resolvedAt: Date.now() });
    return config;
  }

  /** Builds a brand-new McpServer for one request. Must be called once per
   * incoming request (never cached/reused) — see the class doc comment. */
  async buildServerForRequest(slug: string): Promise<McpServer | null> {
    const config = await this.resolve(slug);
    if (!config) return null;

    return buildMcpServer(config.spec, {
      cache: this.deps.toolCache,
      circuitBreakers: this.deps.circuitBreakers,
      concurrency: this.deps.concurrency,
      fetchGuard: config.fetchGuard,
      timeoutMs: this.deps.timeoutMs,
      maxResponseBytes: this.deps.maxResponseBytes,
    });
  }

  /** Drops the cached spec/fetchGuard for `slug` so the next request
   * re-resolves it from the registry — intended for a future
   * redeploy/refine/delete hook (apps/worker, task #9) to call after
   * changing a spec. */
  invalidate(slug: string): void {
    this.resolved.delete(slug);
  }
}
