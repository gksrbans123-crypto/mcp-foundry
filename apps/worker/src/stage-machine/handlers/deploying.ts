import type { Job } from "@mcp-foundry/shared";
import { loadServerSpec } from "@mcp-foundry/spec";
import { summarizeTools } from "../summarize-tools.js";
import type { PipelineDeps, StageOutcome } from "../types.js";

/** "deploying": Deployer registers the spec (plan §2b) and the server goes
 * active. R5: if this exact deploy already completed (a resumed job after
 * a crash between the file write and the stage advance), skip re-running
 * the Deployer and just finish advancing the job. */
export async function runDeployingStage(job: Job, deps: PipelineDeps): Promise<StageOutcome> {
  if (!job.serverId) {
    return { kind: "fail", error: "deploying stage reached without a server_id on the job" };
  }
  const loaded = loadServerSpec(job.parsedSpec);
  if (!loaded.ok) {
    return { kind: "fail", error: `deploying: parsed_spec failed to load: ${loaded.errors.join("; ")}` };
  }
  const spec = loaded.value;

  const server = await deps.repos.servers.findById(job.serverId);
  if (!server) {
    return { kind: "fail", error: `deploying: server ${job.serverId} not found` };
  }

  if (server.status === "active" && server.publicUrl) {
    return { kind: "advance", patch: { stage: "active" } };
  }

  const { publicUrl, deployRef } = await deps.deployer.deploy(spec);
  await deps.repos.servers.update(server.id, {
    status: "active",
    publicUrl,
    deployRef,
    tools: summarizeTools(spec.tools),
  });

  return { kind: "advance", patch: { stage: "active" } };
}
