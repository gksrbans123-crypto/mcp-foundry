import type { Pool } from "pg";
import type { Job } from "@mcp-foundry/shared";
import { advanceStage, createJob, type AdvanceStagePatch } from "../repos/job-repo.js";
import { appendStatusEvent } from "../repos/status-event-repo.js";
import { withTransaction } from "../transaction.js";
import type { Queryable } from "../pool.js";
import { mapJobRow, type JobRow } from "../repos/rows.js";
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_STALE_LOCK_MS,
  type ClaimOptions,
  type EnqueueJobInput,
  type FailOptions,
  type Queue,
} from "./queue.js";

async function assertLockOwnedBy(db: Queryable, jobId: string, workerId: string): Promise<Job> {
  const result = await db.query<JobRow>(`SELECT * FROM jobs WHERE id = $1`, [jobId]);
  const row = result.rows[0];
  if (!row) throw new Error(`assertLockOwnedBy: job ${jobId} not found`);
  if (row.locked_by !== workerId) {
    throw new Error(
      `assertLockOwnedBy: job ${jobId} is not locked by worker ${workerId} (locked_by=${row.locked_by ?? "none"})`,
    );
  }
  return mapJobRow(row);
}

/** PgQueue: Postgres-backed Queue using SELECT ... FOR UPDATE SKIP LOCKED for atomic claims (ADR-003). */
export class PgQueue implements Queue {
  constructor(private readonly pool: Pool) {}

  async enqueue(input: EnqueueJobInput): Promise<Job> {
    return createJob(this.pool, input);
  }

  async claim(workerId: string, options: ClaimOptions = {}): Promise<Job | null> {
    const staleLockMs = options.staleLockMs ?? DEFAULT_STALE_LOCK_MS;
    const result = await this.pool.query<JobRow>(
      `UPDATE jobs SET locked_at = now(), locked_by = $1, attempts = attempts + 1
       WHERE id = (
         SELECT id FROM jobs
         WHERE stage NOT IN ('active', 'failed')
           AND (locked_at IS NULL OR locked_at < now() - ($2 || ' milliseconds')::interval)
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING *`,
      [workerId, String(staleLockMs)],
    );
    return result.rows[0] ? mapJobRow(result.rows[0]) : null;
  }

  async complete(
    jobId: string,
    workerId: string,
    patch: Omit<AdvanceStagePatch, "releaseLock">,
  ): Promise<Job> {
    return withTransaction(this.pool, async (client) => {
      await assertLockOwnedBy(client, jobId, workerId);
      const job = await advanceStage(client, jobId, { ...patch, releaseLock: true });
      await appendStatusEvent(client, {
        jobId,
        step: patch.stage,
        status: "completed",
        message: patch.error ?? null,
      });
      return job;
    });
  }

  async fail(jobId: string, workerId: string, error: string, options: FailOptions = {}): Promise<Job> {
    const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    return withTransaction(this.pool, async (client) => {
      const current = await assertLockOwnedBy(client, jobId, workerId);
      const isTerminal = options.terminal === true || current.attempts >= maxAttempts;
      if (isTerminal && current.type === "create" && current.serverId) {
        // A create job's server row is still 'building' at this point; without
        // this it would stay in-progress forever and never show up under the
        // dashboard's "실패" filter. Guarded so an already-active/deleted
        // server is never clobbered (e.g. a refine-era failure).
        await client.query(
          `UPDATE servers SET status = 'failed', updated_at = now() WHERE id = $1 AND status = 'building'`,
          [current.serverId],
        );
      }
      const job = await advanceStage(client, jobId, {
        stage: isTerminal ? "failed" : current.stage,
        status: isTerminal ? "failed" : current.status,
        error,
        releaseLock: true,
      });
      await appendStatusEvent(client, {
        jobId,
        step: current.stage,
        status: isTerminal ? "failed" : "retrying",
        message: error,
      });
      return job;
    });
  }
}
