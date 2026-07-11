import { loadServerSpec, type ServerSpec } from "@mcp-foundry/spec";
import { validateSpec } from "@mcp-foundry/validator";
import type { GenerateResult } from "./types.js";

/**
 * Last checkpoint before a spec is handed to the "building" pipeline stage:
 * structural (zod) validation, then business-policy validation
 * (packages/validator). Any failure here is itself an R7-style rejection
 * with the concrete reasons attached — not a partially-trusted spec.
 */
export function finalizeSpec(candidate: ServerSpec): GenerateResult {
  const loaded = loadServerSpec(candidate);
  if (!loaded.ok) {
    return { rejected: true, reason: `generated spec failed structural validation: ${loaded.errors.join("; ")}` };
  }

  const validated = validateSpec(loaded.value);
  if (!validated.valid) {
    const details = validated.violations.map((v) => `[${v.rule}] ${v.message}`).join("; ");
    return { rejected: true, reason: `generated spec failed policy validation: ${details}` };
  }

  return { rejected: false, spec: loaded.value };
}
