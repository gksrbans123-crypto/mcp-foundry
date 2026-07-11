import type { AddressInfo } from "node:net";
import { serverSpecSchema, type ServerSpec } from "@mcp-foundry/spec";
import type { Express } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { TtlCache } from "./cache/ttl-cache.js";
import { CircuitBreakerRegistry } from "./limits/circuit-breaker.js";
import { ConcurrencyLimiter } from "./limits/concurrency-limiter.js";
import { McpServerPool } from "./mcp/mcp-server-pool.js";
import { InMemorySpecRegistry } from "./registry/memory-registry.js";

function weatherSpec(): ServerSpec {
  return serverSpecSchema.parse({
    name: "Weather Lookup",
    slug: "weather-demo",
    description: "A weather lookup server.",
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
        inputSchema: {
          type: "object",
          properties: { latitude: { type: "number", description: "Lat." } },
          required: ["latitude"],
          additionalProperties: false,
        },
        request: {
          method: "GET",
          urlTemplate: "https://api.open-meteo.com/v1/forecast",
          headers: [],
          query: [{ key: "latitude", param: "latitude" }],
          body: null,
        },
        response: { fieldSelectors: [{ name: "temperature", path: "current.temperature_2m" }], markdownTemplate: "Temperature: {{temperature}}" },
      },
    ],
  });
}

async function listen(app: Express): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return { baseUrl: `http://127.0.0.1:${port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

describe("buildApp routes", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("GET /healthz returns 200 ok", async () => {
    const registry = new InMemorySpecRegistry();
    const pool = new McpServerPool({
      registry,
      toolCache: new TtlCache(),
      circuitBreakers: new CircuitBreakerRegistry({ failureThreshold: 5, cooldownMs: 1000 }),
      concurrency: new ConcurrencyLimiter(4),
    });
    const { baseUrl, close } = await listen(buildApp({ pool }));
    cleanup = close;

    const res = await fetch(`${baseUrl}/healthz`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 404 for a slug with no registered server", async () => {
    const registry = new InMemorySpecRegistry();
    const pool = new McpServerPool({
      registry,
      toolCache: new TtlCache(),
      circuitBreakers: new CircuitBreakerRegistry({ failureThreshold: 5, cooldownMs: 1000 }),
      concurrency: new ConcurrencyLimiter(4),
    });
    const { baseUrl, close } = await listen(buildApp({ pool }));
    cleanup = close;

    const res = await fetch(`${baseUrl}/s/does-not-exist/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 405 for GET and DELETE on the stateless mcp endpoint", async () => {
    const registry = new InMemorySpecRegistry();
    await registry.set(weatherSpec());
    const pool = new McpServerPool({
      registry,
      toolCache: new TtlCache(),
      circuitBreakers: new CircuitBreakerRegistry({ failureThreshold: 5, cooldownMs: 1000 }),
      concurrency: new ConcurrencyLimiter(4),
    });
    const { baseUrl, close } = await listen(buildApp({ pool }));
    cleanup = close;

    const getRes = await fetch(`${baseUrl}/s/weather-demo/mcp`, { method: "GET" });
    expect(getRes.status).toBe(405);
    const deleteRes = await fetch(`${baseUrl}/s/weather-demo/mcp`, { method: "DELETE" });
    expect(deleteRes.status).toBe(405);
  });

  it("responds to a raw initialize JSON-RPC POST for a registered slug", async () => {
    const registry = new InMemorySpecRegistry();
    await registry.set(weatherSpec());
    const pool = new McpServerPool({
      registry,
      toolCache: new TtlCache(),
      circuitBreakers: new CircuitBreakerRegistry({ failureThreshold: 5, cooldownMs: 1000 }),
      concurrency: new ConcurrencyLimiter(4),
    });
    const { baseUrl, close } = await listen(buildApp({ pool }));
    cleanup = close;

    const res = await fetch(`${baseUrl}/s/weather-demo/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });
    expect(res.status).toBe(200);
    // StreamableHTTPServerTransport replies over SSE ("event: message\ndata:
    // {...}") rather than a plain JSON body, even for a single response.
    const text = await res.text();
    const dataLine = text.split("\n").find((line) => line.startsWith("data:"));
    const body = JSON.parse(dataLine?.slice("data:".length) ?? "{}");
    expect(body.result.serverInfo.name).toBe("weather-demo");
  });
});
