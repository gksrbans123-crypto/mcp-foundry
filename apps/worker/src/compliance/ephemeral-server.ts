import type { Server as HttpServer } from "node:http";
import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { executeTool, type FetchGuard, type ServerSpec } from "@mcp-foundry/spec";
import { toZodShape } from "./schema-to-zod.js";

export interface EphemeralServerHandle {
  url: string;
  close: () => Promise<void>;
}

/** Fresh McpServer per request — mirrors apps/runtime-host's own fix for an
 * McpServer-instance-reuse bug under Protocol.connect() (see that app's
 * mcp-server-pool.ts doc comment); building one is cheap (no I/O). */
function buildEphemeralMcpServer(spec: ServerSpec, fetchGuard: FetchGuard): McpServer {
  const server = new McpServer({ name: spec.slug, version: "0.0.0-precheck" });
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
        const markdown = await executeTool(tool, args as Record<string, unknown>, { fetchGuard });
        return { content: [{ type: "text" as const, text: markdown }] };
      },
    );
  }
  return server;
}

/**
 * Spins up a throwaway, loopback-only MCP HTTP server exposing exactly one
 * candidate spec — used by the "validating" stage to run the Inspector CLI
 * compliance check (task #6/#7) *before* the spec is ever handed to the
 * real Deployer. Never bound to a public interface, never registered with
 * apps/runtime-host.
 */
export async function startEphemeralServer(spec: ServerSpec, fetchGuard: FetchGuard): Promise<EphemeralServerHandle> {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const server = buildEphemeralMcpServer(spec, fetchGuard);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const httpServer = await new Promise<HttpServer>((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
  });

  const address = httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("startEphemeralServer: failed to bind an ephemeral loopback port");
  }

  return {
    url: `http://127.0.0.1:${address.port}/mcp`,
    close: () => new Promise<void>((resolve, reject) => httpServer.close((err) => (err ? reject(err) : resolve()))),
  };
}
