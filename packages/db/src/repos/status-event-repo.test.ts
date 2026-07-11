import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPool, ensureMigrated, hasTestDatabase, truncateAll } from "../test-support/db.js";
import { createUser } from "./user-repo.js";
import { createJob } from "./job-repo.js";
import { appendStatusEvent, listStatusEventsByJob } from "./status-event-repo.js";

describe.skipIf(!hasTestDatabase())("statusEventRepo (integration)", () => {
  let pool: Pool;
  let jobId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await ensureMigrated(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
    const userId = (await createUser(pool, { authRef: "status-event-owner" })).id;
    jobId = (await createJob(pool, { userId, type: "create", input: { nl: "weather" } })).id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("appends events and lists them in chronological order", async () => {
    await appendStatusEvent(pool, { jobId, step: "queued", status: "started" });
    await appendStatusEvent(pool, { jobId, step: "generating", status: "started", message: "calling LLM" });

    const events = await listStatusEventsByJob(pool, jobId);
    expect(events).toHaveLength(2);
    expect(events[0]?.step).toBe("queued");
    expect(events[1]?.message).toBe("calling LLM");
  });

  it("returns an empty list for a job with no events", async () => {
    expect(await listStatusEventsByJob(pool, jobId)).toEqual([]);
  });
});
