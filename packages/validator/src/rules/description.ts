import { SERVICE_NAME } from "@mcp-foundry/shared";
import type { ServerSpec } from "@mcp-foundry/spec";
import type { RuleViolation } from "../types.js";

// Plan §3/§8: description <=1024 chars (also enforced structurally by
// packages/spec's zod schema; re-checked here for defense-in-depth), must
// mention SERVICE_NAME (bilingual by construction), and should otherwise
// read as primarily English. The English check is a heuristic hint, not an
// exact rule: it strips SERVICE_NAME's bundled Korean parenthetical first,
// then flags text whose remaining non-ASCII ratio is too high.
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_NON_ASCII_RATIO = 0.2;

function nonAsciiRatio(text: string): number {
  const withoutServiceName = text.split(SERVICE_NAME).join("");
  if (withoutServiceName.length === 0) return 0;
  const nonAsciiCount = [...withoutServiceName].filter((ch) => ch.codePointAt(0)! > 127).length;
  return nonAsciiCount / withoutServiceName.length;
}

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

  const ratio = nonAsciiRatio(text);
  if (ratio > MAX_NON_ASCII_RATIO) {
    violations.push({
      rule: "description",
      message: `${label} should be primarily English (non-ASCII ratio ${(ratio * 100).toFixed(0)}% exceeds ${MAX_NON_ASCII_RATIO * 100}%)`,
      hint: "author descriptions in English; SERVICE_NAME's bundled Korean parenthetical is the only expected non-English content",
    });
  }

  return violations;
}

export function checkDescriptions(spec: ServerSpec): RuleViolation[] {
  return [
    ...checkDescriptionText("server description", spec.description),
    ...spec.tools.flatMap((tool, index) => checkDescriptionText(`tools[${index}].description`, tool.description)),
  ];
}
