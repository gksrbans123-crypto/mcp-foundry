import type { Job } from "@mcp-foundry/shared";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPool, ensureMigrated, hasTestDatabase, truncateAll } from "../test-support/db.js";
import { createUser } from "../repos/user-repo.js";
import { createServerFromJob, findServerById, updateServer } from "../repos/server-repo.js";
import { listStatusEventsByJob } from "../repos/status-event-repo.js";
import { PgQueue } from "./pg-queue.js";

describe.skipIf(!hasTestDatabase())("PgQueue (integration)", () => {
  let pool: Pool;
  let queue: PgQueue;
  let userId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await ensureMigrated(pool);
    queue = new PgQueue(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
    userId = (await createUser(pool, { authRef: "pg-queue-owner" })).id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("enqueue creates a job in the queued stage", async () => {
    const job = await queue.enqueue({ userId, type: "create", input: { nl: "weather" } });
    expect(job.stage).toBe("queued");
    expect(job.attempts).toBe(0);
  });

  it("claim atomically locks one job and increments attempts", async () => {
    const job = await queue.enqueue({ userId, type: "create", input: { nl: "weather" } });
    const claimed = await queue.claim("worker-a");
    expect(claimed?.id).toBe(job.id);
    expect(claimed?.lockedBy).toBe("worker-a");
    expect(claimed?.attempts).toBe(1);
  });

  it("returns null when there is nothing claimable", async () => {
    expect(await queue.claim("worker-a")).toBeNull();
  });

  it("never lets two workers claim the same job (SKIP LOCKED, no duplicate claims)", async () => {
    const jobs = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        queue.enqueue({ userId, type: "create", input: { nl: `job-${i}` } }),
      ),
    );

    const claims = await Promise.all(
      Array.from({ length: 5 }, (_, i) => queue.claim(`worker-${i}`)),
    );
    const claimedIds = claims.filter((j): j is Job => j !== null).map((j) => j.id);

    expect(new Set(claimedIds).size).toBe(claimedIds.length);
    expect(claimedIds.sort()).toEqual(jobs.map((j) => j.id).sort());
    expect(await queue.claim("worker-extra")).toBeNull();
  });

  it("reclaims a job whose lock is older than staleLockMs (crashed-worker resume)", async () => {
    const job = await queue.enqueue({ userId, type: "create", input: { nl: "resume-me" } });
    const firstClaim = await queue.claim("worker-a");
    expect(firstClaim?.id).toBe(job.id);

    await pool.query("UPDATE jobs SET locked_at = now() - interval '5 minutes' WHERE id = $1", [job.id]);

    const notYetStale = await queue.claim("worker-b", { staleLockMs: 10 * 60_000 });
    expect(notYetStale).toBeNull();

    const reclaimed = await queue.claim("worker-b", { staleLockMs: 60_000 });
    expect(reclaimed?.id).toBe(job.id);
    expect(reclaimed?.lockedBy).toBe("worker-b");
    expect(reclaimed?.attempts).toBe(2);
  });

  it("complete advances the stage, releases the lock, and appends a status_event", async () => {
    const job = await queue.enqueue({ userId, type: "create", input: { nl: "weather" } });
    const claimed = await queue.claim("worker-a");

    const completed = await queue.complete(claimed!.id, "worker-a", {
      stage: "building",
      parsedSpec: { tool: "get_weather" },
    });

    expect(completed.stage).toBe("building");
    expect(completed.lockedAt).toBeNull();
    expect(completed.lockedBy).toBeNull();

    const events = await listStatusEventsByJob(pool, job.id);
    expect(events).toHaveLength(1);
    expect(events[0]?.step).toBe("building");
    expect(events[0]?.status).toBe("completed");
  });

  it("fail retries below maxAttempts, then terminally fails once attempts are exhausted", async () => {
    await queue.enqueue({ userId, type: "create", input: { nl: "flaky" } });

    const firstAttempt = await queue.claim("worker-a");
    const afterFirstFail = await queue.fail(firstAttempt!.id, "worker-a", "upstream 503", {
      maxAttempts: 2,
    });
    expect(afterFirstFail.stage).toBe("queued");
    expect(afterFirstFail.lockedBy).toBeNull();

    const secondAttempt = await queue.claim("worker-a");
    expect(secondAttempt?.attempts).toBe(2);
    const afterSecondFail = await queue.fail(secondAttempt!.id, "worker-a", "upstream 503 again", {
      maxAttempts: 2,
    });
    expect(afterSecondFail.stage).toBe("failed");
    expect(afterSecondFail.error).toBe("upstream 503 again");

    const events = await listStatusEventsByJob(pool, firstAttempt!.id);
    expect(events.map((e) => e.status)).toEqual(["retrying", "failed"]);
  });

  it("fail with terminal:true hard-fails immediately regardless of attempts", async () => {
    await queue.enqueue({ userId, type: "create", input: { nl: "bad-spec" } });
    const claimed = await queue.claim("worker-a");
    const result = await queue.fail(claimed!.id, "worker-a", "DSL envelope exceeded", { terminal: true });
    expect(result.stage).toBe("failed");
  });

  it("terminal failure of a create job marks its still-building server row failed", async () => {
    const job = await queue.enqueue({ userId, type: "create", input: { nl: "weather" } });
    await queue.claim("worker-a");
    const { server } = await createServerFromJob(pool, {
      userId,
      name: "weather-bot",
      slug: "weather-terminal-fail",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-terminal",
    });
    await queue.complete(job.id, "worker-a", { stage: "building", serverId: server.id });
    await queue.claim("worker-a");

    await queue.fail(job.id, "worker-a", "validator rejected the spec", { terminal: true });

    expect((await findServerById(pool, server.id))?.status).toBe("failed");
  });

  it("terminal create failure never clobbers a server that already went active", async () => {
    const job = await queue.enqueue({ userId, type: "create", input: { nl: "weather" } });
    await queue.claim("worker-a");
    const { server } = await createServerFromJob(pool, {
      userId,
      name: "weather-bot",
      slug: "weather-already-active",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-active",
    });
    await updateServer(pool, server.id, { status: "active" });
    await queue.complete(job.id, "worker-a", { stage: "building", serverId: server.id });
    await queue.claim("worker-a");

    await queue.fail(job.id, "worker-a", "late failure", { terminal: true });

    expect((await findServerById(pool, server.id))?.status).toBe("active");
  });

  it("rejects complete/fail from a worker that does not hold the lock", async () => {
    const job = await queue.enqueue({ userId, type: "create", input: { nl: "x" } });
    await queue.claim("worker-a");
    await expect(queue.complete(job.id, "worker-b", { stage: "building" })).rejects.toThrow();
    await expect(queue.fail(job.id, "worker-b", "oops")).rejects.toThrow();
  });
});
