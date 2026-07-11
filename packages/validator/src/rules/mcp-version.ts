import { MAX_MCP_VERSION, MIN_MCP_VERSION, type ServerSpec } from "@mcp-foundry/spec";
import type { RuleViolation } from "../types.js";

// Defense-in-depth re-check of packages/spec's own superRefine bound, using
// the same exported constants so the two packages cannot drift apart.
export function checkMcpVersion(spec: ServerSpec): RuleViolation[] {
  if (spec.mcpVersion < MIN_MCP_VERSION || spec.mcpVersion > MAX_MCP_VERSION) {
    return [
      {
        rule: "mcp-version",
        message: `mcpVersion "${spec.mcpVersion}" is outside the supported range ${MIN_MCP_VERSION}..${MAX_MCP_VERSION}`,
      },
    ];
  }
  return [];
}
