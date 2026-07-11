import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPool, ensureMigrated, hasTestDatabase, truncateAll } from "../test-support/db.js";
import { createUser } from "./user-repo.js";
import { createServerFromJob } from "./server-repo.js";
import { advanceStage, createJob, findJobById } from "./job-repo.js";

describe.skipIf(!hasTestDatabase())("jobRepo (integration)", () => {
  let pool: Pool;
  let userId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await ensureMigrated(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
    userId = (await createUser(pool, { authRef: "job-repo-owner" })).id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates a job in the queued stage with zero attempts", async () => {
    const job = await createJob(pool, {
      userId,
      type: "create",
      input: { nl: "make me a weather server" },
    });
    expect(job.stage).toBe("queued");
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(0);
    expect(job.parsedSpec).toBeNull();
    expect(job.lockedAt).toBeNull();
  });

  it("advanceStage persists the stage and parsedSpec atomically", async () => {
    const job = await createJob(pool, { userId, type: "create", input: { nl: "weather" } });

    const advanced = await advanceStage(pool, job.id, {
      stage: "building",
      parsedSpec: { tool: "get_weather" },
    });

    expect(advanced.stage).toBe("building");
    expect(advanced.status).toBe("building");
    expect(advanced.parsedSpec).toEqual({ tool: "get_weather" });

    const reloaded = await findJobById(pool, job.id);
    expect(reloaded?.parsedSpec).toEqual({ tool: "get_weather" });
  });

  it("resets error on a clean advance but preserves parsedSpec and idempotencyKey across stages", async () => {
    const job = await createJob(pool, { userId, type: "create", input: { nl: "weather" } });
    await advanceStage(pool, job.id, {
      stage: "building",
      parsedSpec: { tool: "get_weather" },
      error: "transient upstream hiccup",
    });

    const advanced = await advanceStage(pool, job.id, { stage: "validating", idempotencyKey: "spec-hash-1" });
    expect(advanced.error).toBeNull();
    expect(advanced.parsedSpec).toEqual({ tool: "get_weather" });
    expect(advanced.idempotencyKey).toBe("spec-hash-1");

    const next = await advanceStage(pool, job.id, { stage: "probing" });
    expect(next.idempotencyKey).toBe("spec-hash-1"); // sticky once set
  });

  it("releases the lock by default when advancing", async () => {
    const job = await createJob(pool, { userId, type: "create", input: { nl: "weather" } });
    await pool.query("UPDATE jobs SET locked_at = now(), locked_by = $1 WHERE id = $2", [
      "worker-x",
      job.id,
    ]);

    const advanced = await advanceStage(pool, job.id, { stage: "generating" });
    expect(advanced.lockedAt).toBeNull();
    expect(advanced.lockedBy).toBeNull();
  });

  it("throws when advancing a nonexistent job", async () => {
    await expect(
      advanceStage(pool, "00000000-0000-0000-0000-000000000000", { stage: "generating" }),
    ).rejects.toThrow();
  });

  it("sets serverId once and keeps it sticky across later advances (task #9 building stage)", async () => {
    const job = await createJob(pool, { userId, type: "create", input: { nl: "weather" } });
    expect(job.serverId).toBeNull();

    const { server } = await createServerFromJob(pool, {
      userId,
      name: "weather-bot",
      slug: "weather-bot-serverid-test",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "job-repo-serverid-test-hash",
    });

    const advanced = await advanceStage(pool, job.id, { stage: "validating", serverId: server.id });
    expect(advanced.serverId).toBe(server.id);

    const next = await advanceStage(pool, job.id, { stage: "probing" });
    expect(next.serverId).toBe(server.id);
  });
});
