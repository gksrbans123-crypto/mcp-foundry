import { findJobById, findServerById, listJobsByServer, listStatusEventsByJob } from "@mcp-foundry/db";
import type { Job, Server, StatusEvent } from "@mcp-foundry/shared";
import { getPool, logDashboardDataError } from "./db-client";
import { findMockJob, findMockServer, findMockStatusEvents, MOCK_JOBS } from "./mock-data";

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
 * Loads a job's timeline by its id alone — capability-based access, matching
 * the creator MCP tools (see apps/creator-mcp tools/get-job-status.ts): a job
 * id is an unguessable UUIDv4 that is only ever handed to its creator, and
 * PlayMCP's no-auth hosting mints a fresh anonymous token per call, so the
 * "진행 상황 보기" link's token routinely differs from the job's owner. An
 * owner check here would 404 the creator's own job.
 */
export async function loadJobContext(
  jobId: string,
  _rawToken: string,
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
    const job = await findJobById(pool, jobId);
    if (!job) {
      return { source: "db", job: null, statusEvents: [], server: null, forbidden: false };
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
 * Capability-based server lookup for the detail page: resolves a server by
 * its unguessable id regardless of which owner token rides on the URL (same
 * rationale as loadJobContext above — PlayMCP no-auth links routinely carry a
 * token that doesn't own the server they point at).
 */
export async function loadServerById(serverId: string, source: "db" | "mock"): Promise<Server | null> {
  if (source === "mock") {
    return findMockServer(serverId) ?? null;
  }
  const pool = getPool();
  if (!pool) return null;
  try {
    return await findServerById(pool, serverId);
  } catch (error) {
    logDashboardDataError("loadServerById", error);
    return null;
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
