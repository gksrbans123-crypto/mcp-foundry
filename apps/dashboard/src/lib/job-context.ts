import { findJobById, findServerById, findUserByAuthRef, listJobsByServer, listStatusEventsByJob } from "@mcp-foundry/db";
import type { Job, Server, StatusEvent } from "@mcp-foundry/shared";
import { getPool, logDashboardDataError } from "./db-client";
import { findMockJob, findMockServer, findMockStatusEvents, MOCK_JOBS } from "./mock-data";
import { hashOwnerToken } from "./token";

export interface JobContext {
  source: "db" | "mock";
  job: Job | null;
  statusEvents: StatusEvent[];
  server: Server | null;
  /** Job exists but belongs to a different owner token — never distinguished from "not found" in the UI. */
  forbidden: boolean;
}

function mockJobContext(jobId: string): JobContext {
  const job = findMockJob(jobId);
  if (!job) {
    return { source: "mock", job: null, statusEvents: [], server: null, forbidden: false };
  }
  return {
    source: "mock",
    job,
    statusEvents: findMockStatusEvents(jobId),
    server: job.serverId ? findMockServer(job.serverId) : null,
    forbidden: false,
  };
}

/**
 * Loads a job's timeline scoped to the owner token that requested it — a job
 * belonging to a different user is reported identically to a nonexistent
 * one (`forbidden`/absence collapse to the same "not found" UI copy) so the
 * page never confirms or denies another user's job IDs exist.
 */
export async function loadJobContext(
  jobId: string,
  rawToken: string,
  options: { forceMock?: boolean } = {},
): Promise<JobContext> {
  if (options.forceMock) {
    return mockJobContext(jobId);
  }

  const pool = getPool();
  if (!pool) {
    return mockJobContext(jobId);
  }

  try {
    const authRef = hashOwnerToken(rawToken);
    const user = await findUserByAuthRef(pool, authRef);
    if (!user) {
      return { source: "db", job: null, statusEvents: [], server: null, forbidden: false };
    }

    const job = await findJobById(pool, jobId);
    if (!job || job.userId !== user.id) {
      return { source: "db", job: null, statusEvents: [], server: null, forbidden: Boolean(job) };
    }

    const [statusEvents, server] = await Promise.all([
      listStatusEventsByJob(pool, job.id),
      job.serverId ? findServerById(pool, job.serverId) : Promise.resolve(null),
    ]);
    return { source: "db", job, statusEvents, server, forbidden: false };
  } catch (error) {
    logDashboardDataError("loadJobContext", error);
    return mockJobContext(jobId);
  }
}

/**
 * Job history for a server's detail page. Takes the already-resolved
 * `source` from loadOwnerContext instead of re-deriving it, so a server
 * rendered from mock fixtures always shows its mock job history even if a
 * real (unrelated) DB happens to be reachable at the same time.
 */
export async function loadJobsForServer(serverId: string, source: "db" | "mock"): Promise<Job[]> {
  if (source === "mock") {
    return MOCK_JOBS.filter((job) => job.serverId === serverId);
  }
  const pool = getPool();
  if (!pool) return [];
  try {
    return await listJobsByServer(pool, serverId);
  } catch (error) {
    logDashboardDataError("loadJobsForServer", error);
    return [];
  }
}
