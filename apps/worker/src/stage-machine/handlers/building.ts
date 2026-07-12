import { SlugConflictError } from "@mcp-foundry/db";
import type { Job } from "@mcp-foundry/shared";
import { loadServerSpec, type ServerSpec } from "@mcp-foundry/spec";
import { summarizeTools } from "../summarize-tools.js";
import type { PipelineDeps, StageOutcome } from "../types.js";

// SLUG_PATTERN allows at most 64 chars total (packages/spec constants.ts).
const SLUG_MAX_LENGTH = 64;

/** Deterministic per-job de-collision suffix, so retries of the same job
 * always target the same slug (keeps the building stage R5-idempotent). */
function suffixedSlug(slug: string, jobId: string): string {
  const suffix = jobId.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 6) || "0";
  const base = slug.slice(0, SLUG_MAX_LENGTH - suffix.length - 1).replace(/-+$/, "");
  return `${base}-${suffix}`;
}

async function createServerRow(job: Job, deps: PipelineDeps, spec: ServerSpec): Promise<StageOutcome> {
  if (!job.idempotencyKey) {
    return { kind: "fail", error: "building: missing idempotency key for create job" };
  }

  const insert = async (slug: string) => {
    const { server } = await deps.repos.servers.createFromJob({
      userId: job.userId,
      name: spec.name,
      slug,
      mcpVersion: spec.mcpVersion,
      tools: summarizeTools(spec.tools),
      idempotencyKey: job.idempotencyKey!,
    });
    return server;
  };

  try {
    const server = await insert(spec.slug);
    return { kind: "advance", patch: { stage: "validating", serverId: server.id } };
  } catch (error) {
    if (!(error instanceof SlugConflictError)) throw error;
  }

  // Template-derived slugs collapse onto fixed defaults (e.g. a second
  // weather server also asks for "weather-lookup") — retry once with a
  // per-job suffix, and persist the new slug back into parsed_spec so the
  // deployed file and public URL stay consistent with the server row.
  const retriedSlug = suffixedSlug(spec.slug, job.id);
  const overriddenSpec = { ...(job.parsedSpec as Record<string, unknown>), slug: retriedSlug };
  const reloaded = loadServerSpec(overriddenSpec);
  if (!reloaded.ok) {
    return {
      kind: "fail",
      error: `building: spec became invalid after slug de-collision ("${retriedSlug}"): ${reloaded.errors.join("; ")}`,
    };
  }

  try {
    const server = await insert(retriedSlug);
    return {
      kind: "advance",
      patch: { stage: "validating", serverId: server.id, parsedSpec: overriddenSpec },
    };
  } catch (error) {
    if (error instanceof SlugConflictError) {
      return {
        kind: "fail",
        error: `building: slug "${spec.slug}" and its de-collided fallback "${retriedSlug}" are both taken`,
      };
    }
    throw error;
  }
}

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
    return createServerRow(job, deps, spec);
  }

  // refine/redeploy/delete: server_id is already set at enqueue time.
  if (!job.serverId) {
    return { kind: "fail", error: `building: ${job.type} job is missing server_id` };
  }
  return { kind: "advance", patch: { stage: "validating" } };
}
