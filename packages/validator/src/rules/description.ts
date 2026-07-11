import { SERVICE_NAME } from "@mcp-foundry/shared";
import type { ServerSpec } from "@mcp-foundry/spec";
import type { RuleViolation } from "../types.js";

// Plan §3/§8: description <=1024 chars (also enforced structurally by
// packages/spec's zod schema; re-checked here for defense-in-depth) and must
// mention SERVICE_NAME. Descriptions may be authored in any language —
// MCP Foundry is a Korean-facing product (Kakao PlayMCP), so LLM-generated
// specs routinely describe tools in Korean; there is no English-only rule.
const MAX_DESCRIPTION_LENGTH = 1024;

function checkDescriptionText(label: string, text: string): RuleViolation[] {
  const violations: RuleViolation[] = [];

  if (text.length > MAX_DESCRIPTION_LENGTH) {
    violations.push({
      rule: "description",
      message: `${label} is ${text.length} characters, exceeding the ${MAX_DESCRIPTION_LENGTH}-character limit`,
    });
  }

  if (!text.includes(SERVICE_NAME)) {
    violations.push({ rule: "description", message: `${label} must mention "${SERVICE_NAME}"` });
  }

  return violations;
}

export function checkDescriptions(spec: ServerSpec): RuleViolation[] {
  return [
    ...checkDescriptionText("server description", spec.description),
    ...spec.tools.flatMap((tool, index) => checkDescriptionText(`tools[${index}].description`, tool.description)),
  ];
}
