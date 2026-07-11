import type { Job, Server, StatusEvent, User } from "@mcp-foundry/shared";

// Row shapes mirror the snake_case SQL columns (migrations/0001_init.sql).
// node-postgres already parses jsonb -> object and timestamptz -> Date, so
// only the casing/naming needs bridging into the shared domain types.

export interface UserRow {
  id: string;
  auth_ref: string;
  created_at: Date;
}

export function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    authRef: row.auth_ref,
    createdAt: row.created_at.toISOString(),
  };
}

export interface ServerRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  public_url: string | null;
  mcp_version: string;
  status: Server["status"];
  tools: Server["tools"];
  probe_result: Server["probeResult"];
  deploy_ref: string | null;
  // Present in the table (deploy idempotency enforcement) but deliberately
  // not part of the shared Server domain type — it's a persistence-layer
  // dedup mechanism, not user-facing data.
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export function mapServerRow(row: ServerRow): Server {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    slug: row.slug,
    publicUrl: row.public_url,
    mcpVersion: row.mcp_version,
    status: row.status,
    tools: row.tools ?? [],
    probeResult: row.probe_result,
    deployRef: row.deploy_ref,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface JobRow {
  id: string;
  user_id: string;
  server_id: string | null;
  type: Job["type"];
  input: Job["input"];
  parsed_spec: Job["parsedSpec"];
  stage: Job["stage"];
  status: Job["status"];
  error: string | null;
  attempts: number;
  locked_at: Date | null;
  locked_by: string | null;
  idempotency_key: string | null;
  created_at: Date;
  updated_at: Date;
}

export function mapJobRow(row: JobRow): Job {
  return {
    id: row.id,
    userId: row.user_id,
    serverId: row.server_id,
    type: row.type,
    input: row.input,
    parsedSpec: row.parsed_spec,
    stage: row.stage,
    status: row.status,
    error: row.error,
    attempts: row.attempts,
    lockedAt: row.locked_at ? row.locked_at.toISOString() : null,
    lockedBy: row.locked_by,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export interface StatusEventRow {
  id: string;
  job_id: string;
  step: string;
  status: string;
  message: string | null;
  at: Date;
}

export function mapStatusEventRow(row: StatusEventRow): StatusEvent {
  return {
    id: row.id,
    jobId: row.job_id,
    step: row.step,
    status: row.status,
    message: row.message,
    at: row.at.toISOString(),
  };
}
