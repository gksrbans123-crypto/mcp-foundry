import type { AddressInfo } from "node:net";
import { serverSpecSchema, type ServerSpec } from "@mcp-foundry/spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../app.js";
import { TtlCache } from "../cache/ttl-cache.js";
import { CircuitBreakerRegistry } from "../limits/circuit-breaker.js";
import { ConcurrencyLimiter } from "../limits/concurrency-limiter.js";
import { InMemorySpecRegistry } from "../registry/memory-registry.js";
import { McpServerPool } from "./mcp-server-pool.js";

function spec(slug: string): ServerSpec {
  return serverSpecSchema.parse({
    name: "Weather Lookup",
    slug,
    description: "A test server.",
    mcpVersion: "2025-06-18",
    tools: [
      {
        name: "get_current_weather",
        title: "Get current weather",
        description: "Get current weather.",
        annotations: {
          title: "Get current weather",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
        request: { method: "GET", urlTemplate: "https://api.example.com/ping", headers: [], query: [], body: null },
        response: { fieldSelectors: [{ name: "x", path: "x" }], markdownTemplate: "{{x}}" },
      },
    ],
  });
}

async function startServer(pool: McpServerPool): Promise<{ port: number; close: () => Promise<void> }> {
  const server = buildApp({ pool }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { port, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

function callToolRequest(port: number, slug: string, id: number) {
  return fetch(`http://127.0.0.1:${port}/s/${slug}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "get_current_weather", arguments: {} } }),
  });
}

/**
 * Regression coverage for a real bug found during review: an earlier
 * version of McpServerPool cached one long-lived McpServer per slug and
 * called `connect()` on it for every request. The MCP SDK's underlying
 * Protocol.connect() throws ("Already connected to a transport...") if
 * invoked again before the previous transport has fully closed, so two
 * concurrent requests to the *same* slug — exactly what ConcurrencyLimiter
 * is meant to allow — would race and the second would fail. The fix builds
 * a fresh McpServer per request (see buildServerForRequest); only the spec
 * lookup and egress-guard construction are cached.
 */
describe("McpServerPool concurrency", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("serves two concurrent slow tools/call requests to the same slug without a transport-conflict error", async () => {
    const registry = new InMemorySpecRegistry();
    await registry.set(spec("weather-demo"));
    const pool = new McpServerPool({
      registry,
      toolCache: new TtlCache(),
      circuitBreakers: new CircuitBreakerRegistry({ failureThreshold: 5, cooldownMs: 1000 }),
      concurrency: new ConcurrencyLimiter(4),
      resolveHost: async () => ["203.0.113.1"],
      sendRequest: async () => {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return new Response(JSON.stringify({ x: "ok" }));
      },
    });
    const { port, close } = await startServer(pool);
    cleanup = close;

    const [r1, r2] = await Promise.all([callToolRequest(port, "weather-demo", 1), callToolRequest(port, "weather-demo", 2)]);
    const [t1, t2] = await Promise.all([r1.text(), r2.text()]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(t1).not.toContain("Already connected");
    expect(t2).not.toContain("Already connected");
    expect(t1).toContain('"content":[{"type":"text","text":"ok"}]');
    expect(t2).toContain('"content":[{"type":"text","text":"ok"}]');
  });

  it("looks up the registry only once per slug, even across multiple requests (only the McpServer itself is rebuilt per request)", async () => {
    const registry = new InMemorySpecRegistry();
    await registry.set(spec("weather-demo"));
    const getSpy = vi.spyOn(registry, "get");

    const pool = new McpServerPool({
      registry,
      toolCache: new TtlCache(),
      circuitBreakers: new CircuitBreakerRegistry({ failureThreshold: 5, cooldownMs: 1000 }),
      concurrency: new ConcurrencyLimiter(4),
      resolveHost: async () => ["203.0.113.1"],
      sendRequest: async () => new Response(JSON.stringify({ x: "ok" })),
    });
    const { port, close } = await startServer(pool);
    cleanup = close;

    await callToolRequest(port, "weather-demo", 1).then((r) => r.text());
    await callToolRequest(port, "weather-demo", 2).then((r) => r.text());

    expect(getSpy).toHaveBeenCalledTimes(1);
  });
});
