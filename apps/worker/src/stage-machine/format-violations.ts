import type { RuleViolation } from "@mcp-foundry/validator";

export function formatViolations(violations: readonly RuleViolation[]): string {
  return violations.map((v) => `[${v.rule}] ${v.message}`).join("; ");
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
