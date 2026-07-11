import { runClaimedJob } from "./stage-machine/run-job.js";
import type { PipelineDeps } from "./stage-machine/types.js";
import { sleep } from "./sleep.js";
import { errorMessage } from "./stage-machine/format-violations.js";

export interface WorkerLoopOptions {
  pollIntervalMs: number;
  staleLockMs: number;
  maxAttempts: number;
}

/** Claims and fully processes at most one job. Returns whether a job was found (so the caller knows whether to poll-delay). */
export async function runWorkerLoopOnce(
  workerId: string,
  deps: PipelineDeps,
  options: WorkerLoopOptions,
): Promise<boolean> {
  const job = await deps.queue.claim(workerId, { staleLockMs: options.staleLockMs });
  if (!job) return false;

  try {
    await runClaimedJob(job, workerId, deps, { maxAttempts: options.maxAttempts });
  } catch (error) {
    // A stage handler threw instead of returning a StageOutcome (a bug, or
    // an unhandled infra error) — treat it as retryable rather than leaving
    // the job stuck locked until staleLockMs, and never let one bad job
    // crash the worker process.
    await deps.queue.fail(job.id, workerId, `unhandled worker error: ${errorMessage(error)}`, {
      maxAttempts: options.maxAttempts,
    });
  }
  return true;
}

/** Runs runWorkerLoopOnce in a loop until `signal` aborts, sleeping between polls when no job was available. */
export async function startWorkerLoop(
  workerId: string,
  deps: PipelineDeps,
  options: WorkerLoopOptions,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    const processed = await runWorkerLoopOnce(workerId, deps, options);
    if (!processed) await sleep(options.pollIntervalMs, signal);
  }
}
