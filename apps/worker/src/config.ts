import { randomUUID } from "node:crypto";
import { loadEnv, type Env } from "@mcp-foundry/shared";
import { z } from "zod";

const workerEnvSchema = z.object({
  WORKER_ID: z.string().min(1).optional(),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WORKER_STALE_LOCK_MS: z.coerce.number().int().positive().default(60_000),
  WORKER_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  // Shared with apps/runtime-host's SPEC_STORE_DIR — both processes must
  // point at the same directory (see deploy/local-file-deployer.ts).
  SPEC_STORE_DIR: z.string().min(1).default("./data/specs"),
});

export interface WorkerConfig {
  env: Env;
  workerId: string;
  pollIntervalMs: number;
  staleLockMs: number;
  maxAttempts: number;
  specStoreDir: string;
  egressAllowlist: string[];
}

export function loadWorkerConfig(source: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const env = loadEnv(source);
  const workerEnv = workerEnvSchema.parse(source);
  const egressAllowlist = env.EGRESS_ALLOWLIST.split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);

  return {
    env,
    workerId: workerEnv.WORKER_ID ?? `worker-${randomUUID().slice(0, 8)}`,
    pollIntervalMs: workerEnv.WORKER_POLL_INTERVAL_MS,
    staleLockMs: workerEnv.WORKER_STALE_LOCK_MS,
    maxAttempts: workerEnv.WORKER_MAX_ATTEMPTS,
    specStoreDir: workerEnv.SPEC_STORE_DIR,
    egressAllowlist,
  };
}
