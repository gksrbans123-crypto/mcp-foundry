import type { Job, JobInput, JobType } from "@mcp-foundry/shared";
import type { AdvanceStagePatch } from "../repos/job-repo.js";

export interface EnqueueJobInput {
  userId: string;
  serverId?: string | null;
  type: JobType;
  input: JobInput;
}

export interface ClaimOptions {
  /** Locks older than this are treated as abandoned (crashed worker) and reclaimable. */
  staleLockMs?: number;
}

export interface FailOptions {
  /** Force a terminal failure regardless of attempts remaining — the caller
   * (apps/worker) decides this per R3, e.g. non-compliant spec vs transient
   * upstream error. */
  terminal?: boolean;
  maxAttempts?: number;
}

export const DEFAULT_MAX_ATTEMPTS = 5;
export const DEFAULT_STALE_LOCK_MS = 60_000;

/**
 * Interface boundary so apps/worker never depends on Postgres directly
 * (plan §0.1 principle 5 — replaceable boundaries).
 */
export interface Queue {
  enqueue(input: EnqueueJobInput): Promise<Job>;
  claim(workerId: string, options?: ClaimOptions): Promise<Job | null>;
  complete(jobId: string, workerId: string, patch: Omit<AdvanceStagePatch, "releaseLock">): Promise<Job>;
  fail(jobId: string, workerId: string, error: string, options?: FailOptions): Promise<Job>;
}
