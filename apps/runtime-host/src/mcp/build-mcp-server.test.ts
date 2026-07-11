import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { serverSpecSchema, type FetchGuard, type ServerSpec } from "@mcp-foundry/spec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "../cache/ttl-cache.js";
import { CircuitBreakerRegistry } from "../limits/circuit-breaker.js";
import { ConcurrencyLimiter } from "../limits/concurrency-limiter.js";
import { buildMcpServer, type BuildMcpServerDeps } from "./build-mcp-server.js";

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
        response: {
          fieldSelectors: [{ name: "temperature", path: "current.temperature_2m" }],
          markdownTemplate: "Temperature: {{temperature}}",
        },
        cacheTtlSeconds: 300,
      },
    ],
  });
}

async function connectedClient(deps: BuildMcpServerDeps, spec: ServerSpec = weatherSpec()) {
  const server = buildMcpServer(spec, deps);
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);
  return client;
}

function baseDeps(fetchGuard: FetchGuard): BuildMcpServerDeps {
  return {
    cache: new TtlCache(),
    circuitBreakers: new CircuitBreakerRegistry({ failureThreshold: 2, cooldownMs: 60_000 }),
    concurrency: new ConcurrencyLimiter(4),
    fetchGuard,
  };
}

describe("buildMcpServer", () => {
  it("exposes the spec's tools via tools/list with annotations intact", async () => {
    const client = await connectedClient(baseDeps(async () => new Response("{}")));
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("get_current_weather");
    expect(tools[0]?.annotations?.readOnlyHint).toBe(true);
  });

  it("calls a tool end to end and returns the rendered markdown", async () => {
    const fetchGuard: FetchGuard = async () =>
      new Response(JSON.stringify({ current: { temperature_2m: 21.4 } }));
    const client = await connectedClient(baseDeps(fetchGuard));

    const result = await client.callTool({ name: "get_current_weather", arguments: { latitude: 37.57 } });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toBe("Temperature: 21.4");
    expect(result.isError).toBeFalsy();
  });

  it("caches a successful readOnly call and does not invoke fetchGuard again for the same args", async () => {
    const fetchGuard = vi.fn(async () => new Response(JSON.stringify({ current: { temperature_2m: 21.4 } })));
    const client = await connectedClient(baseDeps(fetchGuard));

    await client.callTool({ name: "get_current_weather", arguments: { latitude: 37.57 } });
    await client.callTool({ name: "get_current_weather", arguments: { latitude: 37.57 } });

    expect(fetchGuard).toHaveBeenCalledTimes(1);
  });

  it("does not use the cache for a different tenant's identical call (see cache-key tests for full R4 coverage)", async () => {
    const fetchGuard = vi.fn(async () => new Response(JSON.stringify({ current: { temperature_2m: 21.4 } })));
    const deps = baseDeps(fetchGuard);
    const clientA = await connectedClient(deps, { ...weatherSpec(), slug: "tenant-a" });
    const clientB = await connectedClient(deps, { ...weatherSpec(), slug: "tenant-b" });

    await clientA.callTool({ name: "get_current_weather", arguments: { latitude: 37.57 } });
    await clientB.callTool({ name: "get_current_weather", arguments: { latitude: 37.57 } });

    expect(fetchGuard).toHaveBeenCalledTimes(2);
  });

  it("marks a rendered error result with isError and does not cache it", async () => {
    const fetchGuard = vi.fn(async () => new Response("boom", { status: 500 }));
    const client = await connectedClient(baseDeps(fetchGuard));

    const first = await client.callTool({ name: "get_current_weather", arguments: { latitude: 1 } });
    expect(first.isError).toBe(true);

    await client.callTool({ name: "get_current_weather", arguments: { latitude: 1 } });
    expect(fetchGuard).toHaveBeenCalledTimes(2); // not cached, since the first call failed
  });

  it("opens the circuit breaker after consecutive failures and short-circuits further calls", async () => {
    const fetchGuard = vi.fn(async () => new Response("boom", { status: 500 }));
    const client = await connectedClient(baseDeps(fetchGuard));

    await client.callTool({ name: "get_current_weather", arguments: { latitude: 1 } });
    await client.callTool({ name: "get_current_weather", arguments: { latitude: 1 } });
    expect(fetchGuard).toHaveBeenCalledTimes(2);

    const third = await client.callTool({ name: "get_current_weather", arguments: { latitude: 1 } });
    const content = third.content as Array<{ type: string; text: string }>;
    expect(content[0]?.text).toContain("temporarily unavailable");
    expect(fetchGuard).toHaveBeenCalledTimes(2); // breaker short-circuited the 3rd call
  });
});
