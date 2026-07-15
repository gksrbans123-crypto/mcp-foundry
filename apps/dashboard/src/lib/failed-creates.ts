import type { Job, Server } from "@mcp-foundry/shared";

const NAME_MAX_LENGTH = 40;

/**
 * A create job that terminally failed before its server row was inserted
 * (generating/building-stage failures). It exists only in the jobs table, so
 * without special handling the dashboard's "실패" filter would never show it.
 * Failed creates WITH a serverId are excluded — those surface through the
 * real server row, which PgQueue.fail marks as 'failed'.
 */
export function isOrphanFailedCreate(job: Job): boolean {
  return job.type === "create" && job.stage === "failed" && !job.serverId;
}

/**
 * A create job still in flight before its server row exists (queued/generating
 * — the server row is only inserted at the building stage). Without special
 * handling the dashboard looks empty for the first stretch of a build even
 * though /jobs/{id} shows a running pipeline.
 */
export function isOrphanActiveCreate(job: Job): boolean {
  return job.type === "create" && job.stage !== "failed" && job.stage !== "active" && !job.serverId;
}

function toPseudoServer(job: Job, status: Server["status"]): Server {
  const requested = (job.input.name ?? job.input.nl).trim() || "생성 실패한 요청";
  const name = requested.length > NAME_MAX_LENGTH ? `${requested.slice(0, NAME_MAX_LENGTH)}…` : requested;
  return {
    id: job.id,
    userId: job.userId,
    name,
    slug: `요청 ${job.id.slice(0, 8)}`,
    publicUrl: null,
    mcpVersion: "-",
    status,
    tools: [],
    probeResult: null,
    deployRef: null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}

/**
 * Renders an orphan failed-create job as a Server-shaped card entry so the
 * existing filter/count/card pipeline applies unchanged. The pseudo entry's
 * id is the job id — its card links to /jobs/{jobId} (the job timeline),
 * never to /servers/{id}.
 */
export function toFailedCreatePseudoServer(job: Job): Server {
  return toPseudoServer(job, "failed");
}

/** Same Server-shaped rendering for an in-flight orphan create — shows under the "진행중" filter. */
export function toActiveCreatePseudoServer(job: Job): Server {
  return toPseudoServer(job, "building");
}
