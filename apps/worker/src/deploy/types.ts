import type { ServerSpec } from "@mcp-foundry/spec";

export interface DeployResult {
  publicUrl: string;
  deployRef: string;
}

/**
 * Deployer interface (plan §0.1 principle 5 — replaceable boundary). v1's
 * only implementation (LocalFileDeployer) hands a spec to apps/runtime-host
 * by writing it to the same directory runtime-host's FileSpecRegistry reads
 * from (SPEC_STORE_DIR) — no custom protocol between the two processes.
 */
export interface Deployer {
  deploy(spec: ServerSpec): Promise<DeployResult>;
  /** Idempotent: removing an already-absent slug is a no-op, not an error. */
  remove(slug: string): Promise<void>;
}
