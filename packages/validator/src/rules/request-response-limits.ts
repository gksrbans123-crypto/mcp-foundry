import { CACHE_TTL_MAX_SECONDS, URL_TEMPLATE_PATTERN, type ServerSpec } from "@mcp-foundry/spec";
import type { RuleViolation } from "../types.js";

// Defense-in-depth re-check of two structural invariants packages/spec's
// zod schema already enforces (https-only urlTemplate, cacheTtlSeconds
// cap), reusing the same exported pattern/constant to avoid drift.
export function checkRequestResponseLimits(spec: ServerSpec): RuleViolation[] {
  return spec.tools.flatMap((tool, index) => {
    const violations: RuleViolation[] = [];

    if (!URL_TEMPLATE_PATTERN.test(tool.request.urlTemplate)) {
      violations.push({
        rule: "request-response-limits",
        message: `tools[${index}] ("${tool.name}") urlTemplate must be an https:// URL: "${tool.request.urlTemplate}"`,
      });
    }

    if (tool.cacheTtlSeconds !== undefined && tool.cacheTtlSeconds > CACHE_TTL_MAX_SECONDS) {
      violations.push({
        rule: "request-response-limits",
        message: `tools[${index}] ("${tool.name}") cacheTtlSeconds ${tool.cacheTtlSeconds} exceeds the ${CACHE_TTL_MAX_SECONDS}s cap`,
      });
    }

    return violations;
  });
}
