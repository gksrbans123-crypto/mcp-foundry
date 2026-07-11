import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express, { type Express } from "express";
import type { AuthN } from "./auth/authn.js";
import { createAuthMiddleware, type CreatorAuth } from "./auth/middleware.js";
import {
  createIssuanceLimiter,
  createRateLimiters,
  type RateLimiters,
  type TokenBucketLimiter,
} from "./rate-limit/token-bucket.js";
import type { CreatorRepos } from "./repos/types.js";
import { createCreatorMcpServer } from "./tools/register.js";

export interface CreatorAppConfig {
  authn: AuthN;
  repos: CreatorRepos;
  /** Base URL of apps/dashboard (e.g. http://localhost:3000), used to build
   * working `/servers`, `/servers/:id`, `/jobs/:id` links in tool responses. */
  dashboardBaseUrl: string;
  rateLimiters?: RateLimiters;
  /** IP-keyed throttle on auto-issuing new owner tokens (HIGH-2). */
  issuanceLimiter?: TokenBucketLimiter;
}

const methodNotAllowedBody = {
  jsonrpc: "2.0" as const,
  error: { code: -32000, message: "Method not allowed." },
  id: null,
};

/**
 * Builds the Creator MCP Express app (plan §2a, §9): a single stateless
 * Streamable HTTP endpoint at POST /mcp (`sessionIdGenerator: undefined`).
 * A fresh McpServer + transport pair is created per request — mirroring the
 * SDK's own stateless example — so each request's tool handlers close over
 * that request's authenticated userId with no shared state between requests.
 */
export function createApp(config: CreatorAppConfig): Express {
  const rateLimiters = config.rateLimiters ?? createRateLimiters();
  const issuanceLimiter = config.issuanceLimiter ?? createIssuanceLimiter();
  const app = express();
  app.use(express.json());
  app.use(createAuthMiddleware(config.authn, issuanceLimiter));

  app.post("/mcp", async (req, res) => {
    const auth = res.locals.creatorAuth as CreatorAuth;
    const mcpServer = createCreatorMcpServer({
      userId: auth.userId,
      token: auth.token,
      isNewToken: auth.isNewToken,
      rateLimitKey: auth.rateLimitKey,
      repos: config.repos,
      rateLimiters,
      dashboardBaseUrl: config.dashboardBaseUrl,
    });

    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        transport.close();
        mcpServer.close();
      });
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  app.get("/mcp", (_req, res) => {
    res.status(405).json(methodNotAllowedBody);
  });
  app.delete("/mcp", (_req, res) => {
    res.status(405).json(methodNotAllowedBody);
  });

  return app;
}
