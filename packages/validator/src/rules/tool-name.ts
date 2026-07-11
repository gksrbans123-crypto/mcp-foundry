import { NAME_PATTERN, type ServerSpec } from "@mcp-foundry/spec";
import type { RuleViolation } from "../types.js";

// Defense-in-depth: packages/spec's zod schema already enforces NAME_PATTERN
// and tool-name uniqueness structurally, but zod refinements are not
// reflected in the inferred TS type, so a hand-built ServerSpec-shaped value
// (e.g. from a future caller that skips loadServerSpec) can still violate
// them at runtime. Reuses NAME_PATTERN from @mcp-foundry/spec rather than
// redefining it, so the two packages cannot drift apart.
export function checkToolNames(spec: ServerSpec): RuleViolation[] {
  const patternViolations: RuleViolation[] = spec.tools
    .filter((tool) => !NAME_PATTERN.test(tool.name))
    .map((tool) => ({
      rule: "tool-name",
      message: `tool name "${tool.name}" must match ${NAME_PATTERN} (1-128 chars, [A-Za-z0-9_-])`,
    }));

  const seen = new Set<string>();
  const duplicateViolations: RuleViolation[] = [];
  for (const tool of spec.tools) {
    if (seen.has(tool.name)) {
      duplicateViolations.push({ rule: "tool-name", message: `duplicate tool name "${tool.name}" (case-sensitive)` });
    }
    seen.add(tool.name);
  }

  return [...patternViolations, ...duplicateViolations];
}
