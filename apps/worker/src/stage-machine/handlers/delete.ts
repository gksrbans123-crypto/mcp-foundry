import type { Job } from "@mcp-foundry/shared";
import type { PipelineDeps, StageOutcome } from "../types.js";

/**
 * `delete` jobs skip generating/building/validating/probing entirely — no
 * spec regeneration is needed to remove a server. Both the Deployer.remove
 * and softDelete are idempotent, so a crash-and-retry mid-delete is safe.
 *
 * The resulting job stage is "active" (the job pipeline finished
 * successfully) even though the *server*'s status is "deleted" — Job.stage
 * and Server.status are independent vocabularies; a successfully completed
 * delete job is not itself a failure.
 */
export async function runDeleteJob(job: Job, deps: PipelineDeps): Promise<StageOutcome> {
  if (!job.serverId) {
    return { kind: "fail", error: "delete job is missing server_id" };
  }
  const server = await deps.repos.servers.findById(job.serverId);
  if (!server) {
    return { kind: "fail", error: `delete: server ${job.serverId} not found` };
  }

  await deps.deployer.remove(server.slug);
  await deps.repos.servers.softDelete(server.id);

  return { kind: "advance", patch: { stage: "active" } };
}
