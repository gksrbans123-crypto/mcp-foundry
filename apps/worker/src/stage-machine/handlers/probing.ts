import type { Job } from "@mcp-foundry/shared";
import { loadServerSpec } from "@mcp-foundry/spec";
import type { PipelineDeps, StageOutcome } from "../types.js";

/** "probing": synthetic latency probe hard gate (R1-R3). Persists
 * probe_result on the server row (already created at "building"). */
export async function runProbingStage(job: Job, deps: PipelineDeps): Promise<StageOutcome> {
  const loaded = loadServerSpec(job.parsedSpec);
  if (!loaded.ok) {
    return { kind: "fail", error: `probing: parsed_spec failed to load: ${loaded.errors.join("; ")}` };
  }
  const spec = loaded.value;

  const outcome = await deps.probe(spec);
  if (outcome.kind === "transient") {
    return { kind: "retry", error: outcome.reason };
  }
  if (outcome.kind === "failed") {
    return { kind: "fail", error: outcome.reason };
  }

  if (job.serverId) {
    await deps.repos.servers.update(job.serverId, { probeResult: outcome.result });
  }

  return { kind: "advance", patch: { stage: "deploying" } };
}
