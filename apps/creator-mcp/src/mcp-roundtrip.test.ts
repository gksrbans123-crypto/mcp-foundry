import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createSignedOwnerTokenAuthN } from "./auth/signed-owner-token.js";
import { createMemoryRepos } from "./repos/memory-repos.js";

// Real end-to-end verification (task #5 completion criterion: "로컬에서 서버
// 기동 + MCP 왕복(initialize/tools/list/tools/call) 응답") using the SDK's own
// Client + StreamableHTTPClientTransport, exactly as a real MCP client would,
// against a live HTTP server on an ephemeral port.
describe("MCP round trip over Streamable HTTP (stateless)", () => {
  let httpServer: HttpServer;
  let mcpUrl: string;

  beforeAll(async () => {
    const repos = createMemoryRepos();
    const authn = createSignedOwnerTokenAuthN({ secret: "roundtrip-test-secret", users: repos.users });
    const app = createApp({ authn, repos, dashboardBaseUrl: "http://localhost:3000" });

    httpServer = await new Promise<HttpServer>((resolve) => {
      const server = app.listen(0, () => resolve(server));
    });
    const { port } = httpServer.address() as AddressInfo;
    mcpUrl = `http://127.0.0.1:${port}/mcp`;
  });

  afterAll(() => {
    httpServer.close();
  });

  it("initializes, lists all 7 tools, and calls a read-only tool", async () => {
    const client = new Client({ name: "roundtrip-test-client", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));

    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      [
        "create_mcp_server",
        "delete_server",
        "get_dashboard_link",
        "get_job_status",
        "get_server_details",
        "list_my_servers",
        "refine_mcp_server",
      ].sort(),
    );
    for (const tool of tools.tools) {
      expect(tool.annotations).toBeDefined();
      expect(typeof tool.annotations?.readOnlyHint).toBe("boolean");
    }

    const result = await client.callTool({ name: "get_dashboard_link", arguments: {} });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.type).toBe("text");
    expect(content[0]?.text).toContain("대시보드");

    await client.close();
  });

  it("auto-issues an owner token for a client with no prior credential", async () => {
    const client = new Client({ name: "roundtrip-test-client-fresh", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
    await client.connect(transport);

    const result = await client.callTool({ name: "get_dashboard_link", arguments: {} });
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.text).toContain("New owner token issued");

    await client.close();
  });

  it("round-trips create_mcp_server end to end via the real HTTP transport", async () => {
    const client = new Client({ name: "roundtrip-test-client-create", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
    await client.connect(transport);

    const result = await client.callTool({
      name: "create_mcp_server",
      arguments: { spec_text: "A tool that reports the weather for a given city." },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text?: string }>;
    expect(content[0]?.text).toMatch(/만들고 있어요/);

    await client.close();
  });
});
