import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterEach, describe, expect, it } from "vitest";
import type { FetchGuard } from "@mcp-foundry/spec";
import { buildTestSpec, buildTestTool } from "../test-support/fixtures.js";
import { startEphemeralServer, type EphemeralServerHandle } from "./ephemeral-server.js";

const fakeFetchGuard: FetchGuard = async () =>
  new Response(JSON.stringify({ temp: 20 }), { status: 200, headers: { "content-type": "application/json" } });

describe("startEphemeralServer", () => {
  let handle: EphemeralServerHandle | undefined;

  afterEach(async () => {
    await handle?.close();
    handle = undefined;
  });

  it("serves tools/list and a real tools/call round trip via the MCP protocol", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    handle = await startEphemeralServer(spec, fakeFetchGuard);

    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(handle.url));
    await client.connect(transport);

    try {
      const tools = await client.listTools();
      expect(tools.tools.map((t) => t.name)).toEqual(["get_weather"]);

      const result = await client.callTool({ name: "get_weather", arguments: { city: "Seoul" } });
      const content = result.content as Array<{ type: string; text: string }>;
      expect(content[0]?.text).toBe("Temp: 20");
    } finally {
      await client.close();
    }
  });

  it("binds to loopback only and reports its ephemeral port in the returned URL", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    handle = await startEphemeralServer(spec, fakeFetchGuard);

    expect(handle.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/mcp$/);
  });
});
