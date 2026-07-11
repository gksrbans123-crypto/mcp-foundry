import type { ServerSpec } from "@mcp-foundry/spec";
import {
  checkAnnotations,
  checkDescriptions,
  checkForbiddenWords,
  checkMcpVersion,
  checkRequestResponseLimits,
  checkToolCount,
  checkToolNames,
} from "./rules/index.js";
import type { Rule, ValidateSpecResult } from "./types.js";

// Plan §8 compliance-by-construction gate. Runs after packages/spec's
// loadServerSpec has already structurally validated the raw spec — this
// function checks the business-policy rules the DSL schema deliberately
// excludes (kakao, tool count) plus defense-in-depth re-checks of
// invariants the schema enforces structurally (see each rules/*.ts file).
const RULES: Rule[] = [
  checkForbiddenWords,
  checkToolCount,
  checkToolNames,
  checkAnnotations,
  checkDescriptions,
  checkMcpVersion,
  checkRequestResponseLimits,
];

export function validateSpec(spec: ServerSpec): ValidateSpecResult {
  const violations = RULES.flatMap((rule) => rule(spec));
  return { valid: violations.length === 0, violations };
}
