import type { ServerSpec } from "@mcp-foundry/spec";

export interface RuleViolation {
  rule: string;
  message: string;
  /** Set when the violation is recoverable by an upstream stage rather than a hard rejection (plan §8 "<3개 요청: 자동 보강 시도"). */
  hint?: string;
}

export interface ValidateSpecResult {
  valid: boolean;
  violations: RuleViolation[];
}

export type Rule = (spec: ServerSpec) => RuleViolation[];
