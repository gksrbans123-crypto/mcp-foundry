import type { Server, ServerStatus } from "@mcp-foundry/shared";
import type { Queryable } from "../pool.js";
import { mapServerRow, type ServerRow } from "./rows.js";

export interface CreateServerFromJobInput {
  userId: string;
  name: string;
  slug: string;
  mcpVersion: string;
  tools: Server["tools"];
  idempotencyKey: string;
}

export interface CreateServerFromJobResult {
  server: Server;
  alreadyExisted: boolean;
}

/**
 * Enforces the R5 deploy idempotency invariant: inserts a new 'building'
 * server, but if a server with this idempotencyKey (sha256 of parsed_spec)
 * already exists, returns that one instead. The UNIQUE constraint on
 * servers.idempotency_key — not this function's logic — is what actually
 * guarantees no duplicate public URL under concurrent/retried deploys.
 */
export async function createServerFromJob(
  db: Queryable,
  input: CreateServerFromJobInput,
): Promise<CreateServerFromJobResult> {
  const inserted = await db.query<ServerRow>(
    `INSERT INTO servers (user_id, name, slug, mcp_version, status, tools, idempotency_key)
     VALUES ($1, $2, $3, $4, 'building', $5::jsonb, $6)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [input.userId, input.name, input.slug, input.mcpVersion, JSON.stringify(input.tools), input.idempotencyKey],
  );
  if (inserted.rows[0]) {
    return { server: mapServerRow(inserted.rows[0]), alreadyExisted: false };
  }
  const existing = await db.query<ServerRow>(`SELECT * FROM servers WHERE idempotency_key = $1`, [
    input.idempotencyKey,
  ]);
  if (!existing.rows[0]) {
    throw new Error(
      `createServerFromJob: idempotency_key conflict but no existing row found for ${input.idempotencyKey}`,
    );
  }
  return { server: mapServerRow(existing.rows[0]), alreadyExisted: true };
}

export async function findServerById(db: Queryable, id: string): Promise<Server | null> {
  const result = await db.query<ServerRow>(`SELECT * FROM servers WHERE id = $1`, [id]);
  return result.rows[0] ? mapServerRow(result.rows[0]) : null;
}

export async function findServerBySlug(db: Queryable, slug: string): Promise<Server | null> {
  const result = await db.query<ServerRow>(`SELECT * FROM servers WHERE slug = $1`, [slug]);
  return result.rows[0] ? mapServerRow(result.rows[0]) : null;
}

export async function findServerByDeployIdempotencyKey(
  db: Queryable,
  idempotencyKey: string,
): Promise<Server | null> {
  const result = await db.query<ServerRow>(`SELECT * FROM servers WHERE idempotency_key = $1`, [
    idempotencyKey,
  ]);
  return result.rows[0] ? mapServerRow(result.rows[0]) : null;
}

export interface ListServersOptions {
  status?: ServerStatus[];
}

export async function listServersByUser(
  db: Queryable,
  userId: string,
  options: ListServersOptions = {},
): Promise<Server[]> {
  const result = options.status?.length
    ? await db.query<ServerRow>(
        `SELECT * FROM servers WHERE user_id = $1 AND status = ANY($2::text[]) ORDER BY created_at DESC`,
        [userId, options.status],
      )
    : await db.query<ServerRow>(`SELECT * FROM servers WHERE user_id = $1 ORDER BY created_at DESC`, [
        userId,
      ]);
  return result.rows.map(mapServerRow);
}

export interface UpdateServerPatch {
  name?: string;
  publicUrl?: string | null;
  status?: ServerStatus;
  tools?: Server["tools"];
  probeResult?: Server["probeResult"];
  deployRef?: string | null;
}

export async function updateServer(db: Queryable, id: string, patch: UpdateServerPatch): Promise<Server> {
  const result = await db.query<ServerRow>(
    `UPDATE servers SET
       name = COALESCE($2, name),
       public_url = CASE WHEN $3 THEN $4 ELSE public_url END,
       status = COALESCE($5, status),
       tools = COALESCE($6::jsonb, tools),
       probe_result = CASE WHEN $7 THEN $8::jsonb ELSE probe_result END,
       deploy_ref = CASE WHEN $9 THEN $10 ELSE deploy_ref END,
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      patch.name ?? null,
      "publicUrl" in patch,
      patch.publicUrl ?? null,
      patch.status ?? null,
      patch.tools ? JSON.stringify(patch.tools) : null,
      "probeResult" in patch,
      patch.probeResult ? JSON.stringify(patch.probeResult) : null,
      "deployRef" in patch,
      patch.deployRef ?? null,
    ],
  );
  if (!result.rows[0]) throw new Error(`updateServer: server ${id} not found`);
  return mapServerRow(result.rows[0]);
}

/** Idempotent: deleting an already-deleted server is a no-op, not an error. */
export async function softDeleteServer(db: Queryable, id: string): Promise<Server> {
  const result = await db.query<ServerRow>(
    `UPDATE servers SET status = 'deleted', updated_at = now() WHERE id = $1 AND status <> 'deleted' RETURNING *`,
    [id],
  );
  if (result.rows[0]) return mapServerRow(result.rows[0]);
  const existing = await db.query<ServerRow>(`SELECT * FROM servers WHERE id = $1`, [id]);
  if (!existing.rows[0]) throw new Error(`softDeleteServer: server ${id} not found`);
  return mapServerRow(existing.rows[0]);
}
