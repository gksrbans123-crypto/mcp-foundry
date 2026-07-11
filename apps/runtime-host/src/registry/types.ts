import type { ServerSpec } from "@mcp-foundry/spec";

/**
 * Source of truth the runtime-host consults to find which declarative spec
 * to serve for a given slug (task #4: "스펙 소스는 SpecRegistry 인터페이스").
 * Kept swappable per plan §0.1 principle 5 (Deployer/Queue/AuthN/etc. are
 * all interfaces) so apps/worker (task #9, not yet built) can choose how it
 * hands a freshly deployed spec to this process.
 */
export interface SpecRegistry {
  get(slug: string): Promise<ServerSpec | null>;
  set(spec: ServerSpec): Promise<void>;
}
