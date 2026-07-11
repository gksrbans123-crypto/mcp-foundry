import type { LLMClient } from "../llm/types.js";
import { inferEndpointDescriptor } from "../llm-descriptor/infer.js";
import { defaultOpenApiFetcher, extractEndpointFromOpenApi, type OpenApiFetcher } from "../openapi/index.js";
import type { EndpointDescriptor, GenerateRequest } from "../types.js";

export interface ResolveDescriptorDeps {
  llm: LLMClient;
  fetchOpenApi?: OpenApiFetcher;
}

/**
 * Plan §4 fallback ordering: an explicit endpointDescriptor wins outright;
 * otherwise try deterministic OpenAPI extraction; otherwise ask the LLM to
 * infer a descriptor from NL alone. Returns null (not a throw) when every
 * option is exhausted, signaling the caller to reject (R7).
 */
export async function resolveDescriptor(
  request: GenerateRequest,
  deps: ResolveDescriptorDeps,
): Promise<EndpointDescriptor | null> {
  if (request.endpointDescriptor) return request.endpointDescriptor;

  if (request.openapiUrl) {
    const fetcher = deps.fetchOpenApi ?? defaultOpenApiFetcher;
    try {
      const doc = await fetcher(request.openapiUrl);
      const extracted = extractEndpointFromOpenApi(doc);
      if (extracted) return extracted;
    } catch {
      // Fetch/parse failure falls through to LLM inference below rather
      // than rejecting outright — the NL alone may still be enough.
    }
  }

  return inferEndpointDescriptor(request.nl, deps.llm);
}
