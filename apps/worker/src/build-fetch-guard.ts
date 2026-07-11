import type { FetchGuard, ServerSpec } from "@mcp-foundry/spec";
import { createGuardedFetch } from "./egress/guarded-fetch.js";

/** Same host-derivation as apps/runtime-host's McpServerPool.resolve(): a
 * spec's own urlTemplates, never caller-supplied arguments, decide which
 * hosts egress is allowed to. */
export function buildFetchGuardForSpec(spec: ServerSpec, globalAllowlist: readonly string[]): FetchGuard {
  const allowedHosts = new Set(spec.tools.map((tool) => new URL(tool.request.urlTemplate).hostname.toLowerCase()));
  return createGuardedFetch({ allowedHosts, globalAllowlist });
}
