import type { Job } from "@mcp-foundry/shared";
import { findUserByAuthRef, listJobsByUser, listServersByUser, listStatusEventsByJob } from "@mcp-foundry/db";
import { getPool, logDashboardDataError } from "./db-client";
import { isOrphanFailedCreate, toFailedCreatePseudoServer } from "./failed-creates";
import { buildMockOwnerContext, type OwnerContext } from "./mock-data";
import { derivePipeline, type StageState } from "./pipeline";
import { hashOwnerToken } from "./token";

export type { OwnerContext } from "./mock-data";

/**
 * Resolves the servers owned by a raw owner token.
 *
 * - `forceMock: true` (the "데모 보기" entry point) always returns the fixed
 *   demo fixtures, regardless of DB state — the one path the "목데이터 렌더
 *   확인" completion criterion can rely on in CI/review without a live DB.
 * - Otherwise: no DATABASE_URL, or any query failure, falls back to the same
 *   mock fixtures (task requirement: DB 미연결 시 데모 목데이터 폴백).
 * - A reachable DB with no matching user is a *real* empty state
 *   (`notFound: true`), not a mock fallback — the token was simply never
 *   issued (or wrong), which is different from "we couldn't reach Postgres".
 */
export async function loadOwnerContext(rawToken: string, options: { forceMock?: boolean } = {}): Promise<OwnerContext> {
  if (options.forceMock) {
    return buildMockOwnerContext();
  }

  const pool = getPool();
  if (!pool) {
    return buildMockOwnerContext();
  }

  try {
    const authRef = hashOwnerToken(rawToken);
    const user = await findUserByAuthRef(pool, authRef);
    if (!user) {
      return { source: "db", user: null, servers: [], failedCreates: [], notFound: true, pipelines: {} };
    }
    const [servers, jobs] = await Promise.all([
      listServersByUser(pool, user.id),
      listJobsByUser(pool, user.id),
    ]);

    // Latest job per server drives that server's card pipeline.
    const latestByServer = new Map<string, Job>();
    for (const job of jobs) {
      if (!job.serverId) continue;
      const prev = latestByServer.get(job.serverId);
      if (!prev || job.createdAt > prev.createdAt) latestByServer.set(job.serverId, job);
    }

    // Create jobs that died before a server row existed live only in the
    // jobs table — surface them as failed cards instead of silently hiding.
    const orphanFailedJobs = jobs.filter(isOrphanFailedCreate);
    const failedCreates = orphanFailedJobs.map(toFailedCreatePseudoServer);

    const pipelines: Record<string, StageState[]> = {};
    await Promise.all([
      ...servers.map(async (server) => {
        const job = latestByServer.get(server.id) ?? null;
        const events = job ? await listStatusEventsByJob(pool, job.id) : [];
        pipelines[server.id] = derivePipeline(job, events);
      }),
      ...orphanFailedJobs.map(async (job) => {
        const events = await listStatusEventsByJob(pool, job.id);
        pipelines[job.id] = derivePipeline(job, events);
      }),
    ]);

    return { source: "db", user, servers, failedCreates, notFound: false, pipelines };
  } catch (error) {
    logDashboardDataError("loadOwnerContext", error);
    return buildMockOwnerContext();
  }
}
