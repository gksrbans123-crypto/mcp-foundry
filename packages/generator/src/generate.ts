import { augmentToolCount } from "./augment/index.js";
import { checkEnvelope } from "./envelope/check-envelope.js";
import { resolveDescriptor } from "./fallback/index.js";
import { finalizeSpec } from "./finalize.js";
import type { LLMClient } from "./llm/types.js";
import { matchTemplate } from "./matching/match-template.js";
import type { OpenApiFetcher } from "./openapi/index.js";
import { TEMPLATES, type Template } from "./templates/index.js";
import type { GenerateRequest, GenerateResult } from "./types.js";
import { buildHttpWrapperSpec } from "./wrapper/build-spec.js";

export interface GenerateDeps {
  llm: LLMClient;
  templates?: Template[];
  fetchOpenApi?: OpenApiFetcher;
}

const NO_ENDPOINT_REASON =
  "could not determine a single upstream HTTP endpoint for this request (no template match, no OpenAPI/descriptor, and the LLM could not infer one) — this may be outside the DSL's supported envelope";

/**
 * Plan §4 / ADR-001 generation strategy: curated template match first, then
 * a deterministic HTTP-wrapper fallback (OpenAPI extraction, an explicit
 * descriptor, or LLM inference — see fallback/resolve-descriptor.ts), with
 * an R7 rejection (never a broken spec) whenever the request falls outside
 * the DSL's envelope at any checkpoint.
 *
 * Template matching is skipped when the caller already supplied an
 * openapiUrl or endpointDescriptor: that is a precise machine-readable hint
 * about the exact endpoint to wrap, which should win over a fuzzy NL-based
 * guess at a curated template.
 */
export async function generateSpec(request: GenerateRequest, deps: GenerateDeps): Promise<GenerateResult> {
  const envelopeCheck = checkEnvelope(request);
  if (!envelopeCheck.withinEnvelope) {
    return { rejected: true, reason: envelopeCheck.reason };
  }

  const hasExplicitEndpointHint = Boolean(request.openapiUrl || request.endpointDescriptor);
  if (!hasExplicitEndpointHint) {
    const templates = deps.templates ?? TEMPLATES;
    const matched = await matchTemplate(request.nl, templates, deps.llm);
    if (matched) {
      const spec = matched.buildSpec(request.name ? { name: request.name } : undefined);
      return finalizeSpec(augmentToolCount(spec));
    }
  }

  const descriptor = await resolveDescriptor(request, deps);
  if (!descriptor) {
    return { rejected: true, reason: NO_ENDPOINT_REASON };
  }

  const candidate = buildHttpWrapperSpec(descriptor, request);
  return finalizeSpec(augmentToolCount(candidate));
}
