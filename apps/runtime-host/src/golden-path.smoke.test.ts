import http from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { loadServerSpec, weatherFixture, type ServerSpec } from "@mcp-foundry/spec";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { TtlCache } from "./cache/ttl-cache.js";
import { defaultSendPinnedRequest } from "./egress/send-pinned-request.js";
import { CircuitBreakerRegistry } from "./limits/circuit-breaker.js";
import { ConcurrencyLimiter } from "./limits/concurrency-limiter.js";
import { McpServerPool } from "./mcp/mcp-server-pool.js";
import { InMemorySpecRegistry } from "./registry/memory-registry.js";

/**
 * P1 fixture-first golden path (plan §10): prove interpreter load -> deploy
 * (register into the runtime) -> public URL -> a *real* MCP client round
 * trip (initialize -> tools/list -> tools/call), without the Generator.
 *
 * The upstream (open-meteo.com) is stood in locally rather than hit live,
 * so this test is deterministic and network-independent — everything else
 * in the path is exercised for real: schema validation, the SpecRegistry,
 * McpServerPool, the egress guard's socket-pinning mechanism (only the DNS
 * *decision* is stubbed; ip-range-check/resolve-host already have full
 * dedicated unit coverage), the interpreter, and the actual MCP protocol
 * wire format over real HTTP.
 */
describe("golden path: fixture spec served over a real MCP client round trip", () => {
  let cleanupServers: Array<() => Promise<void>> = [];

  afterEach(async () => {
    await Promise.all(cleanupServers.map((close) => close()));
    cleanupServers = [];
  });

  it("registers the weather fixture and answers initialize -> tools/list -> tools/call", async () => {
    const loaded = loadServerSpec(weatherFixture);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) throw new Error("weather fixture failed schema validation");

    const currentWeatherTool = loaded.value.tools.find((tool) => tool.name === "get_current_weather");
    if (!currentWeatherTool) throw new Error("get_current_weather tool not found in fixture");

    const upstream = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          current: { time: "2026-07-09T12:00", temperature_2m: 24.1, wind_speed_10m: 8.2, relative_humidity_2m: 55 },
        }),
      );
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    const upstreamPort = (upstream.address() as AddressInfo).port;
    cleanupServers.push(() => new Promise((resolve) => upstream.close(() => resolve())));

    // Only the network target changes — inputSchema, request/response
    // mappings, and annotations are untouched from the real fixture tool.
    const testSpec: ServerSpec = {
      ...loaded.value,
      slug: "weather-demo",
      tools: [
        {
          ...currentWeatherTool,
          request: { ...currentWeatherTool.request, urlTemplate: `http://weather-stub.local:${upstreamPort}/v1/forecast` },
        },
      ],
    };

    const registry = new InMemorySpecRegistry();
    await registry.set(testSpec);

    const pool = new McpServerPool({
      registry,
      toolCache: new TtlCache(),
      circuitBreakers: new CircuitBreakerRegistry({ failureThreshold: 5, cooldownMs: 30_000 }),
      concurrency: new ConcurrencyLimiter(4),
      resolveHost: async (hostname) => {
        if (hostname === "weather-stub.local") return ["127.0.0.1"];
        throw new Error(`unexpected host in golden-path smoke test: ${hostname}`);
      },
      sendRequest: defaultSendPinnedRequest,
    });

    const runtimeHttpServer = buildApp({ pool }).listen(0);
    await new Promise((resolve) => runtimeHttpServer.once("listening", resolve));
    const runtimePort = (runtimeHttpServer.address() as AddressInfo).port;
    cleanupServers.push(() => new Promise((resolve) => runtimeHttpServer.close(() => resolve())));

    const client = new Client({ name: "golden-path-smoke-test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${runtimePort}/s/weather-demo/mcp`));
    await client.connect(transport);

    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toContain("get_current_weather");

    const result = await client.callTool({
      name: "get_current_weather",
      arguments: { latitude: 37.57, longitude: 126.98 },
    });
    const content = result.content as Array<{ type: string; text: string }>;
    expect(result.isError).toBeFalsy();
    expect(content[0]?.text).toBe(
      "**Current Weather**\n\n- Time: 2026-07-09T12:00\n- Temperature: 24.1 °C\n- Wind speed: 8.2 km/h\n- Humidity: 55%",
    );

    await client.close();
  });
});
