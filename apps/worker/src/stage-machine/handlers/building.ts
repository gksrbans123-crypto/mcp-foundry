import type { Job } from "@mcp-foundry/shared";
import { loadServerSpec } from "@mcp-foundry/spec";
import { summarizeTools } from "../summarize-tools.js";
import type { PipelineDeps, StageOutcome } from "../types.js";

/** "building": spec -> interpreter load artifact + typecheck (plan §2b) —
 * an independent re-validation through packages/spec's own schema, plus
 * (for `create` jobs) the R5-idempotent server row creation. */
export async function runBuildingStage(job: Job, deps: PipelineDeps): Promise<StageOutcome> {
  const loaded = loadServerSpec(job.parsedSpec);
  if (!loaded.ok) {
    return { kind: "fail", error: `building: parsed_spec failed to load: ${loaded.errors.join("; ")}` };
  }
  const spec = loaded.value;

  if (job.type === "create") {
    if (!job.idempotencyKey) {
      return { kind: "fail", error: "building: missing idempotency key for create job" };
    }
    const { server } = await deps.repos.servers.createFromJob({
      userId: job.userId,
      name: spec.name,
      slug: spec.slug,
      mcpVersion: spec.mcpVersion,
      tools: summarizeTools(spec.tools),
      idempotencyKey: job.idempotencyKey,
    });
    return { kind: "advance", patch: { stage: "validating", serverId: server.id } };
  }

  // refine/redeploy/delete: server_id is already set at enqueue time.
  if (!job.serverId) {
    return { kind: "fail", error: `building: ${job.type} job is missing server_id` };
  }
  return { kind: "advance", patch: { stage: "validating" } };
}
