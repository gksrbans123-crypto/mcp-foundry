import type { Server } from "@mcp-foundry/shared";
import { describe, expect, it } from "vitest";
import { createRateLimiters } from "../rate-limit/token-bucket.js";
import { createMemoryRepos, type MemoryRepos } from "../repos/memory-repos.js";
import type { ToolContext } from "./context.js";
import { createRefineMcpServerHandler } from "./refine-mcp-server.js";

function buildServer(overrides: Partial<Server> = {}): Server {
  const now = new Date().toISOString();
  return {
    id: "server-1",
    userId: "original-owner",
    name: "Weather Bot",
    slug: "weather-bot",
    publicUrl: "https://example.com/s/weather-bot/mcp",
    mcpVersion: "2025-06-18",
    status: "active",
    tools: [],
    probeResult: null,
    deployRef: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function buildCtx(overrides: Partial<ToolContext> = {}): { ctx: ToolContext; repos: MemoryRepos } {
  const repos = createMemoryRepos();
  const ctx: ToolContext = {
    userId: "anon-fresh-user",
    token: "fresh-anon-token",
    rateLimitKey: "ip:127.0.0.1",
    repos,
    rateLimiters: createRateLimiters(),
    dashboardBaseUrl: "http://localhost:3000",
    ...overrides,
  };
  return { ctx, repos };
}

function extractJobId(markdown: string): string {
  const match = markdown.match(/\*\*Job ID:\*\* `([^`]+)`/);
  if (!match) throw new Error(`no Job ID in: ${markdown}`);
  return match[1]!;
}

describe("refine_mcp_server handler", () => {
  it("queues the rebuild job under the SERVER's owner, not the call's throwaway anonymous identity", async () => {
    // Regression: a refine from a fresh PlayMCP no-auth identity used to own
    // the job itself, so the rebuild never appeared in the account that owns
    // the server being refined.
    const { ctx, repos } = buildCtx();
    repos.seedServer(buildServer({ userId: "original-owner" }));
    const handler = createRefineMcpServerHandler(ctx);

    const result = await handler({ server_id: "server-1", spec_text: "리팩토링 해줘" });
    const job = await repos.jobs.findById(extractJobId(result.content[0].text));

    expect(result.isError).toBeUndefined();
    expect(job?.userId).toBe("original-owner");
    expect(job?.type).toBe("refine");
  });

  it("builds response links with the owner_token identity when provided", async () => {
    const { ctx, repos } = buildCtx({ verifyToken: async (token) => `user-of-${token}` });
    repos.seedServer(buildServer());
    const handler = createRefineMcpServerHandler(ctx);

    const result = await handler({ server_id: "server-1", spec_text: "개선해줘", owner_token: "tok.abc" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("token=tok.abc");
  });
});
