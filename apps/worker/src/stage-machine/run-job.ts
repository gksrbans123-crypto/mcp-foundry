import type { Job } from "@mcp-foundry/shared";
import { runBuildingStage } from "./handlers/building.js";
import { runDeleteJob } from "./handlers/delete.js";
import { runDeployingStage } from "./handlers/deploying.js";
import { runGeneratingStage } from "./handlers/generating.js";
import { runProbingStage } from "./handlers/probing.js";
import { runValidatingStage } from "./handlers/validating.js";
import type { PipelineDeps, StageOutcome } from "./types.js";

/**
 * job.stage names the pipeline stage this job is currently parked at /
 * about to execute next. "queued" and "generating" both route to the
 * generating handler — a job never actually rests at "generating" in this
 * implementation (the handler's own outcome always advances straight to
 * "building" or terminally fails), so "generating" only appears here for
 * defensive completeness. This keeps live progress simple: a create job
 * shows "queued" for the whole (typically few-second) generation step,
 * then advances through building/validating/probing/deploying/active in
 * quick succession.
 */
async function dispatch(job: Job, deps: PipelineDeps): Promise<StageOutcome> {
  if (job.type === "delete") return runDeleteJob(job, deps);
  if (job.type === "redeploy") {
    return { kind: "fail", error: "redeploy job type is not yet implemented (no caller enqueues it today)" };
  }

  switch (job.stage) {
    case "queued":
    case "generating":
      return runGeneratingStage(job, deps);
    case "building":
      return runBuildingStage(job, deps);
    case "validating":
      return runValidatingStage(job, deps);
    case "probing":
      return runProbingStage(job, deps);
    case "deploying":
      return runDeployingStage(job, deps);
    default:
      return { kind: "fail", error: `unexpected stage "${job.stage}" for job ${job.id}` };
  }
}

export interface RunClaimedJobOptions {
  /** R3 job-level retry ceiling passed through to Queue.fail; packages/db
   * escalates to a terminal failure automatically once attempts exhaust it. */
  maxAttempts?: number;
}

/** Runs one claimed job's next unit of work and reports the outcome back to the queue. */
export async function runClaimedJob(
  job: Job,
  workerId: string,
  deps: PipelineDeps,
  options: RunClaimedJobOptions = {},
): Promise<StageOutcome> {
  const outcome = await dispatch(job, deps);

  if (outcome.kind === "advance") {
    await deps.queue.complete(job.id, workerId, outcome.patch);
  } else if (outcome.kind === "retry") {
    await deps.queue.fail(job.id, workerId, outcome.error, { maxAttempts: options.maxAttempts });
  } else {
    await deps.queue.fail(job.id, workerId, outcome.error, { terminal: true });
  }

  return outcome;
}
