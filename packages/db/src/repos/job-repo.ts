import type { Job, JobInput, JobStage, JobStatus, JobType } from "@mcp-foundry/shared";
import type { Queryable } from "../pool.js";
import { mapJobRow, type JobRow } from "./rows.js";

export interface CreateJobInput {
  userId: string;
  serverId?: string | null;
  type: JobType;
  input: JobInput;
}

export async function createJob(db: Queryable, input: CreateJobInput): Promise<Job> {
  const result = await db.query<JobRow>(
    `INSERT INTO jobs (user_id, server_id, type, input, stage, status, attempts)
     VALUES ($1, $2, $3, $4::jsonb, 'queued', 'queued', 0)
     RETURNING *`,
    [input.userId, input.serverId ?? null, input.type, JSON.stringify(input.input)],
  );
  return mapJobRow(result.rows[0]!);
}

export async function findJobById(db: Queryable, id: string): Promise<Job | null> {
  const result = await db.query<JobRow>(`SELECT * FROM jobs WHERE id = $1`, [id]);
  return result.rows[0] ? mapJobRow(result.rows[0]) : null;
}

export async function listJobsByUser(db: Queryable, userId: string): Promise<Job[]> {
  const result = await db.query<JobRow>(
    `SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(mapJobRow);
}

export async function listJobsByServer(db: Queryable, serverId: string): Promise<Job[]> {
  const result = await db.query<JobRow>(
    `SELECT * FROM jobs WHERE server_id = $1 ORDER BY created_at DESC`,
    [serverId],
  );
  return result.rows.map(mapJobRow);
}

export interface AdvanceStagePatch {
  stage: JobStage;
  status?: JobStatus;
  /** Pass `null` to clear a previously-persisted spec; omit to leave it untouched. */
  parsedSpec?: Record<string, unknown> | null;
  error?: string | null;
  idempotencyKey?: string | null;
  /** Set once a `create` job's server row exists (task #9 "building" stage);
   * sticky like idempotencyKey — omit to leave an already-set value untouched. */
  serverId?: string | null;
  releaseLock?: boolean;
}

/**
 * R5 invariant: advances a job's stage and persists any produced artifact
 * (parsed_spec/idempotency_key/server_id/error) as one atomic UPDATE. Passing
 * a transaction client (see transaction.ts) additionally lets callers
 * combine this with a status_event append in the same commit. `error`
 * always resets to the given value (or null) on advance — it is
 * stage-scoped, unlike parsedSpec/idempotencyKey/serverId which persist
 * across stages once set.
 */
export async function advanceStage(db: Queryable, jobId: string, patch: AdvanceStagePatch): Promise<Job> {
  const releaseLock = patch.releaseLock ?? true;
  const hasParsedSpec = "parsedSpec" in patch;
  const parsedSpecJson =
    patch.parsedSpec !== undefined && patch.parsedSpec !== null ? JSON.stringify(patch.parsedSpec) : null;
  const result = await db.query<JobRow>(
    `UPDATE jobs SET
       stage = $2,
       status = $3,
       parsed_spec = CASE WHEN $4 THEN $5::jsonb ELSE parsed_spec END,
       error = $6,
       idempotency_key = COALESCE($7, idempotency_key),
       server_id = COALESCE($8, server_id),
       locked_at = CASE WHEN $9 THEN NULL ELSE locked_at END,
       locked_by = CASE WHEN $9 THEN NULL ELSE locked_by END,
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      jobId,
      patch.stage,
      patch.status ?? patch.stage,
      hasParsedSpec,
      parsedSpecJson,
      patch.error ?? null,
      patch.idempotencyKey ?? null,
      patch.serverId ?? null,
      releaseLock,
    ],
  );
  if (!result.rows[0]) throw new Error(`advanceStage: job ${jobId} not found`);
  return mapJobRow(result.rows[0]);
}
