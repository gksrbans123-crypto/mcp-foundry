import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { RequestHandler } from "express";
import type { McpServerPool } from "../mcp/mcp-server-pool.js";

/**
 * POST /s/:slug/mcp — stateless Streamable HTTP endpoint (plan §1/§5.1).
 * A fresh McpServer *and* a fresh transport are built per request
 * (sessionIdGenerator: undefined) — the MCP SDK's Protocol.connect() throws
 * if called again on an instance still attached to a transport, so a
 * single long-lived McpServer per slug cannot safely serve two concurrent
 * requests (see mcp-server-pool.ts). Only the spec lookup and egress-guard
 * construction are cached; building the server itself is cheap (no I/O).
 */
export function createMcpPostHandler(pool: McpServerPool): RequestHandler {
  return async (req, res) => {
    const slug = req.params.slug;
    if (typeof slug !== "string" || slug.length === 0) {
      res.status(400).json({ error: "missing slug" });
      return;
    }

    const server = await pool.buildServerForRequest(slug);
    if (!server) {
      res.status(404).json({ error: `no active MCP server for slug "${slug}"` });
      return;
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
}

/** GET/DELETE aren't meaningful on a stateless (no session ID) endpoint —
 * those methods exist in the Streamable HTTP spec for SSE resumption and
 * session termination, neither of which apply here. */
export function methodNotAllowedHandler(): RequestHandler {
  return (_req, res) => {
    res.status(405).json({ error: "method not allowed on a stateless MCP endpoint" });
  };
}
