"use server";

import { revalidatePath } from "next/cache";
import {
  PgQueue,
  findServerById,
  findUserByAuthRef,
  updateServer,
} from "@mcp-foundry/db";
import { getPool } from "./db-client";
import { resolveOwnerToken } from "./owner-token";
import { hashOwnerToken } from "./token";

/**
 * Resolves the owner from the request cookie and verifies they own `serverId`
 * before any mutation runs — the dashboard's IDOR guard. Throws (rather than
 * silently no-op'ing) so a forged serverId never appears to succeed. Returns
 * the live pool + server so callers don't re-query.
 */
async function authorizeServerAction(serverId: string) {
  const pool = getPool();
  if (!pool) throw new Error("서버 관리 기능은 데이터베이스 연결이 필요합니다.");

  const token = await resolveOwnerToken(undefined);
  if (!token) throw new Error("인증 토큰이 없습니다.");

  const user = await findUserByAuthRef(pool, hashOwnerToken(token));
  if (!user) throw new Error("인증에 실패했습니다.");

  const server = await findServerById(pool, serverId);
  if (!server || server.userId !== user.id) {
    // Same message for "missing" and "not yours" — don't reveal which.
    throw new Error("서버를 찾을 수 없습니다.");
  }
  return { pool, user, server };
}

function revalidateServer(serverId: string): void {
  revalidatePath("/servers");
  revalidatePath(`/servers/${serverId}`);
}

/** Pause a server: spec stays deployed, but runtime-host stops serving it
 * (only "active" servers are served) until re-enabled. */
export async function disableServerAction(serverId: string): Promise<void> {
  const { pool, server } = await authorizeServerAction(serverId);
  if (server.status === "active") {
    await updateServer(pool, serverId, { status: "disabled" });
    revalidateServer(serverId);
  }
}

/** Resume a paused server. */
export async function enableServerAction(serverId: string): Promise<void> {
  const { pool, server } = await authorizeServerAction(serverId);
  if (server.status === "disabled") {
    await updateServer(pool, serverId, { status: "active" });
    revalidateServer(serverId);
  }
}

/** Permanently delete: enqueues a delete job so the worker removes the spec
 * file and marks the server deleted (same path as the delete_server tool). */
export async function deleteServerAction(serverId: string): Promise<void> {
  const { pool, user, server } = await authorizeServerAction(serverId);
  if (server.status === "deleted") return; // idempotent
  const queue = new PgQueue(pool);
  await queue.enqueue({
    userId: user.id,
    serverId: server.id,
    type: "delete",
    input: { nl: `Delete server ${server.slug}` },
  });
  revalidateServer(serverId);
}
