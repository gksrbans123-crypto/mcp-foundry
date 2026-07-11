import { computeParsedSpecHash } from "@mcp-foundry/db";
import type { Job } from "@mcp-foundry/shared";
import { loadServerSpec, type ServerSpec } from "@mcp-foundry/spec";
import type { EndpointDescriptor, GenerateRequest } from "@mcp-foundry/generator";
import type { PipelineDeps, StageOutcome } from "../types.js";

/**
 * refine/redeploy must keep the server's existing public URL — the freshly
 * generated spec's own (NL-derived) slug is discarded in favor of the
 * server's slug, then re-validated since overriding a validated field is
 * cheap insurance against a stale/mismatched SLUG_PATTERN edge case.
 */
async function applyRefineSlugOverride(
  spec: ServerSpec,
  job: Job,
  deps: PipelineDeps,
): Promise<{ ok: true; spec: ServerSpec } | { ok: false; error: string }> {
  if (!job.serverId) return { ok: false, error: `${job.type}: missing server_id` };
  const existing = await deps.repos.servers.findById(job.serverId);
  if (!existing) return { ok: false, error: `${job.type}: server ${job.serverId} not found` };

  const overridden = { ...spec, slug: existing.slug };
  const reloaded = loadServerSpec(overridden);
  if (!reloaded.ok) {
    return {
      ok: false,
      error: `${job.type}: spec became invalid after slug override: ${reloaded.errors.join("; ")}`,
    };
  }
  return { ok: true, spec: reloaded.value };
}

/** "queued"/"generating": NL(+OpenAPI/descriptor) -> declarative spec (plan §2b). */
export async function runGeneratingStage(job: Job, deps: PipelineDeps): Promise<StageOutcome> {
  const request: GenerateRequest = {
    nl: job.input.nl,
    openapiUrl: job.input.openapiUrl,
    endpointDescriptor: job.input.endpointDescriptor as EndpointDescriptor | undefined,
    name: job.input.name,
  };

  const result = await deps.generate(request);
  if (result.rejected) {
    return { kind: "fail", error: result.reason };
  }

  let spec = result.spec;
  if (job.type === "refine" || job.type === "redeploy") {
    const overridden = await applyRefineSlugOverride(spec, job, deps);
    if (!overridden.ok) return { kind: "fail", error: overridden.error };
    spec = overridden.spec;
  }

  return {
    kind: "advance",
    patch: { stage: "building", parsedSpec: spec, idempotencyKey: computeParsedSpecHash(spec) },
  };
}
