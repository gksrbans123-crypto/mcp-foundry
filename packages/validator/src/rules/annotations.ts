import type { ServerSpec } from "@mcp-foundry/spec";
import type { RuleViolation } from "../types.js";

// Plan §3 "annotations 5종 필수". Defense-in-depth against a hand-built
// ServerSpec-shaped value missing a field at runtime despite the TS type
// (see rules/tool-name.ts for why that is possible).
const BOOLEAN_ANNOTATION_KEYS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const;

export function checkAnnotations(spec: ServerSpec): RuleViolation[] {
  return spec.tools.flatMap((tool, index) => {
    const missingBooleans = BOOLEAN_ANNOTATION_KEYS.filter((key) => typeof tool.annotations[key] !== "boolean");
    const missingTitle = typeof tool.annotations.title !== "string" || tool.annotations.title.length === 0;

    const violations: RuleViolation[] = missingBooleans.map((key) => ({
      rule: "annotations",
      message: `tools[${index}] ("${tool.name}") is missing boolean annotation "${key}"`,
    }));

    if (missingTitle) {
      violations.push({
        rule: "annotations",
        message: `tools[${index}] ("${tool.name}") is missing annotation "title"`,
      });
    }

    return violations;
  });
}
