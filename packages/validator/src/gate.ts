import { inspectServer, type InspectorRunnerOptions } from "./inspector-runner.js";
import type { ValidateSpecResult } from "./types.js";

/**
 * Normalizes the Inspector CLI check (task #6) to the same
 * `{ valid, violations }` shape as `validateSpec`, so a pipeline stage can
 * treat the static-check gate and the live-protocol gate uniformly.
 */
export async function runInspectorCheck(
  url: string,
  options?: InspectorRunnerOptions,
): Promise<ValidateSpecResult> {
  const result = await inspectServer(url, options);
  return {
    valid: result.passed,
    violations: result.failures.map((message) => ({ rule: "inspector", message })),
  };
}
