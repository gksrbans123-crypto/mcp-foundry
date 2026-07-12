import type { Server } from "@mcp-foundry/shared";
import { describe, expect, it } from "vitest";
import { createRateLimiters } from "../rate-limit/token-bucket.js";
import { createMemoryRepos, type MemoryRepos } from "../repos/memory-repos.js";
import type { ToolContext } from "./context.js";
import { createDeleteServerHandler } from "./delete-server.js";

function buildServer(overrides: Partial<Server> = {}): Server {
  const now = new Date().toISOString();
  return {
    id: "server-1",
    userId: "user-1",
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

function buildCtx(): { ctx: ToolContext; repos: MemoryRepos } {
  const repos = createMemoryRepos();
  const ctx: ToolContext = {
    userId: "user-1",
    token: "test-token",
    rateLimitKey: "user-1",
    repos,
    rateLimiters: createRateLimiters(),
    dashboardBaseUrl: "http://localhost:3000",
  };
  return { ctx, repos };
}

describe("delete_server handler", () => {
  it("enqueues a delete job for an active server owned by the caller", async () => {
    const { ctx, repos } = buildCtx();
    repos.seedServer(buildServer());
    const handler = createDeleteServerHandler(ctx);

    const result = await handler({ server_id: "server-1" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/Delete job queued/);
  });

  it("is idempotent: deleting an already-deleted server is a no-op, not an error", async () => {
    const { ctx, repos } = buildCtx();
    repos.seedServer(buildServer({ status: "deleted" }));
    const handler = createDeleteServerHandler(ctx);

    const result = await handler({ server_id: "server-1" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/Already deleted/);
  });

  it("deletes a server by its id from a different session (capability-based — PlayMCP no-auth fragments identity per call)", async () => {
    const { ctx, repos } = buildCtx();
    repos.seedServer(buildServer({ userId: "someone-else" }));
    const handler = createDeleteServerHandler(ctx);

    const result = await handler({ server_id: "server-1" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toMatch(/Delete job queued/);
  });

  it("returns not-found for a nonexistent server id", async () => {
    const { ctx } = buildCtx();
    const handler = createDeleteServerHandler(ctx);

    const result = await handler({ server_id: "does-not-exist" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/);
  });

  it("rejects once the mutate rate limit is exhausted", async () => {
    const { ctx, repos } = buildCtx();
    repos.seedServer(buildServer());
    const handler = createDeleteServerHandler(ctx);

    for (let i = 0; i < 3; i++) await handler({ server_id: "irrelevant" });
    const result = await handler({ server_id: "server-1" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Rate limit exceeded/);
  });
});
