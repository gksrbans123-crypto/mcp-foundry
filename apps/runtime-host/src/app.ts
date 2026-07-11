import express from "express";
import type { McpServerPool } from "./mcp/mcp-server-pool.js";
import { createMcpPostHandler, methodNotAllowedHandler } from "./routes/mcp-route.js";

export interface AppDeps {
  pool: McpServerPool;
}

/** Builds the Express app without binding a port — kept separate from
 * index.ts's process entrypoint so tests can exercise real HTTP behavior
 * against an ephemeral `app.listen(0)` without starting the real process. */
export function buildApp(deps: AppDeps): express.Express {
  const app = express();
  app.use(express.json());

  app.post("/s/:slug/mcp", createMcpPostHandler(deps.pool));
  app.get("/s/:slug/mcp", methodNotAllowedHandler());
  app.delete("/s/:slug/mcp", methodNotAllowedHandler());

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return app;
}
