import type { Job } from "@mcp-foundry/shared";
import { loadServerSpec } from "@mcp-foundry/spec";
import { errorMessage, formatViolations } from "../format-violations.js";
import type { PipelineDeps, StageOutcome } from "../types.js";

/** "validating": static policy rules (packages/validator) + Inspector
 * compliance check against a throwaway local instance (plan §2b/§10). A
 * compliance-check *infrastructure* error (subprocess/network) retries;
 * an actual non-compliant result hard-fails. */
export async function runValidatingStage(job: Job, deps: PipelineDeps): Promise<StageOutcome> {
  const loaded = loadServerSpec(job.parsedSpec);
  if (!loaded.ok) {
    return { kind: "fail", error: `validating: parsed_spec failed to load: ${loaded.errors.join("; ")}` };
  }
  const spec = loaded.value;

  const staticResult = deps.validateSpec(spec);
  if (!staticResult.valid) {
    return { kind: "fail", error: `spec failed policy validation: ${formatViolations(staticResult.violations)}` };
  }

  let complianceResult;
  try {
    complianceResult = await deps.checkCompliance(spec);
  } catch (error) {
    return { kind: "retry", error: `compliance check infrastructure error: ${errorMessage(error)}` };
  }
  if (!complianceResult.valid) {
    return {
      kind: "fail",
      error: `spec failed Inspector compliance check: ${formatViolations(complianceResult.violations)}`,
    };
  }

  return { kind: "advance", patch: { stage: "probing" } };
}
