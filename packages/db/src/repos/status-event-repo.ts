import type { StatusEvent } from "@mcp-foundry/shared";
import type { Queryable } from "../pool.js";
import { mapStatusEventRow, type StatusEventRow } from "./rows.js";

export interface AppendStatusEventInput {
  jobId: string;
  step: string;
  status: string;
  message?: string | null;
}

/** status_events is an append-only audit log — no update/delete by design. */
export async function appendStatusEvent(
  db: Queryable,
  input: AppendStatusEventInput,
): Promise<StatusEvent> {
  const result = await db.query<StatusEventRow>(
    `INSERT INTO status_events (job_id, step, status, message) VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.jobId, input.step, input.status, input.message ?? null],
  );
  return mapStatusEventRow(result.rows[0]!);
}

export async function listStatusEventsByJob(db: Queryable, jobId: string): Promise<StatusEvent[]> {
  const result = await db.query<StatusEventRow>(
    `SELECT * FROM status_events WHERE job_id = $1 ORDER BY at ASC`,
    [jobId],
  );
  return result.rows.map(mapStatusEventRow);
}
