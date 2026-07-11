import { describe, expect, it } from "vitest";
import { createRateLimiters } from "../rate-limit/token-bucket.js";
import { createMemoryRepos, type MemoryRepos } from "../repos/memory-repos.js";
import type { ToolContext } from "./context.js";
import { createGetJobStatusHandler } from "./get-job-status.js";

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

describe("get_job_status handler", () => {
  it("exposes the job's server_id so a caller can chain into get_server_details/refine/delete", async () => {
    const { ctx, repos } = buildCtx();
    const now = new Date().toISOString();
    repos.seedJob({
      id: "job-1",
      userId: "user-1",
      serverId: "server-1",
      type: "create",
      input: { nl: "spec" },
      parsedSpec: null,
      stage: "active",
      status: "active",
      error: null,
      attempts: 1,
      lockedAt: null,
      lockedBy: null,
      idempotencyKey: null,
      createdAt: now,
      updatedAt: now,
    });
    const handler = createGetJobStatusHandler(ctx);

    const result = await handler({ job_id: "job-1" });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("**Server ID:** `server-1`");
  });

  it("renders 'none yet' when the job has no server_id (still generating)", async () => {
    const { ctx, repos } = buildCtx();
    const now = new Date().toISOString();
    repos.seedJob({
      id: "job-2",
      userId: "user-1",
      serverId: null,
      type: "create",
      input: { nl: "spec" },
      parsedSpec: null,
      stage: "queued",
      status: "queued",
      error: null,
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      idempotencyKey: null,
      createdAt: now,
      updatedAt: now,
    });
    const handler = createGetJobStatusHandler(ctx);

    const result = await handler({ job_id: "job-2" });

    expect(result.content[0].text).toContain("**Server ID:** _none yet_");
  });

  it("returns not-found for a job owned by a different user", async () => {
    const { ctx, repos } = buildCtx();
    const now = new Date().toISOString();
    repos.seedJob({
      id: "job-3",
      userId: "someone-else",
      serverId: null,
      type: "create",
      input: { nl: "spec" },
      parsedSpec: null,
      stage: "queued",
      status: "queued",
      error: null,
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      idempotencyKey: null,
      createdAt: now,
      updatedAt: now,
    });
    const handler = createGetJobStatusHandler(ctx);

    const result = await handler({ job_id: "job-3" });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/);
  });
});
