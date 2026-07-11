import type { ServerSpec } from "@mcp-foundry/spec";
import type { RuleViolation } from "../types.js";

// Plan §8 "kakao 금칙어": substring match, case-insensitive, across every
// user-visible name/slug/description on the server and on every tool.
const FORBIDDEN_WORDS = ["kakao"];

function fieldViolation(label: string, value: string): RuleViolation | null {
  const lower = value.toLowerCase();
  const hit = FORBIDDEN_WORDS.find((word) => lower.includes(word));
  return hit
    ? {
        rule: "forbidden-word",
        message: `${label} contains forbidden substring "${hit}" (case-insensitive): "${value}"`,
      }
    : null;
}

export function checkForbiddenWords(spec: ServerSpec): RuleViolation[] {
  const fields: Array<[string, string]> = [
    ["server name", spec.name],
    ["server slug", spec.slug],
    ["server description", spec.description],
    ...spec.tools.flatMap(
      (tool, index): Array<[string, string]> => [
        [`tools[${index}].name`, tool.name],
        [`tools[${index}].title`, tool.title],
        [`tools[${index}].description`, tool.description],
        [`tools[${index}].annotations.title`, tool.annotations.title],
      ],
    ),
  ];

  return fields
    .map(([label, value]) => fieldViolation(label, value))
    .filter((violation): violation is RuleViolation => violation !== null);
}
