import type { Server } from "@mcp-foundry/shared";
import { describe, expect, it } from "vitest";
import { createRateLimiters } from "../rate-limit/token-bucket.js";
import { createMemoryRepos, type MemoryRepos } from "../repos/memory-repos.js";
import type { ToolContext } from "./context.js";
import { createListMyServersHandler } from "./list-my-servers.js";

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

function buildCtx(overrides: Partial<ToolContext> = {}): { ctx: ToolContext; repos: MemoryRepos } {
  const repos = createMemoryRepos();
  const ctx: ToolContext = {
    userId: "user-1",
    token: "test-token",
    rateLimitKey: "user-1",
    repos,
    rateLimiters: createRateLimiters(),
    dashboardBaseUrl: "http://localhost:3000",
    ...overrides,
  };
  return { ctx, repos };
}

describe("list_my_servers handler", () => {
  it("includes each server's id — the only way a caller can obtain server_id for other tools", async () => {
    const { ctx, repos } = buildCtx();
    repos.seedServer(buildServer());
    const handler = createListMyServersHandler(ctx);

    const result = await handler({});

    expect(result.content[0].text).toContain("`server-1`");
    expect(result.content[0].text).toContain("| ID | Name | Status | Slug | Public URL |");
  });

  it("only lists servers owned by the caller", async () => {
    const { ctx, repos } = buildCtx();
    repos.seedServer(buildServer({ id: "server-mine", userId: "user-1" }));
    repos.seedServer(buildServer({ id: "server-other", userId: "someone-else" }));
    const handler = createListMyServersHandler(ctx);

    const result = await handler({});

    expect(result.content[0].text).toContain("server-mine");
    expect(result.content[0].text).not.toContain("server-other");
  });

  it("filters by status when provided", async () => {
    const { ctx, repos } = buildCtx();
    repos.seedServer(buildServer({ id: "server-active", status: "active" }));
    repos.seedServer(buildServer({ id: "server-failed", status: "failed" }));
    const handler = createListMyServersHandler(ctx);

    const result = await handler({ status: "failed" });

    expect(result.content[0].text).toContain("server-failed");
    expect(result.content[0].text).not.toContain("server-active");
  });

  it("lists the owner_token identity's servers (conversation-carried identity under PlayMCP no-auth)", async () => {
    const { ctx, repos } = buildCtx({ verifyToken: async (token) => `user-of-${token}` });
    repos.seedServer(buildServer({ id: "server-owned", userId: "user-of-tok.abc" }));
    const handler = createListMyServersHandler(ctx);

    const result = await handler({ owner_token: "tok.abc" });

    expect(result.content[0].text).toContain("server-owned");
  });

  it("renders an empty state when the caller has no servers", async () => {
    const { ctx } = buildCtx();
    const handler = createListMyServersHandler(ctx);

    const result = await handler({});

    expect(result.content[0].text).toMatch(/no MCP servers yet/);
  });
});
