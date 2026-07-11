import type { ServerSpec, ToolAnnotations, ToolInputSchema } from "@mcp-foundry/spec";
import { toIdentifier, toSlug, toToolName } from "../slug.js";
import type { EndpointDescriptor, EndpointDescriptorParam, GenerateRequest } from "../types.js";
import { buildDescription } from "./description.js";

const CACHE_TTL_SECONDS = 60;

function isPathToken(url: string, paramName: string): boolean {
  return url.includes(`{${paramName}}`);
}

function buildInputSchema(params: EndpointDescriptorParam[]): ToolInputSchema {
  const properties: ToolInputSchema["properties"] = {};
  for (const param of params) {
    properties[param.name] = { type: param.type, description: param.description };
  }
  return {
    type: "object",
    properties,
    required: params.filter((param) => param.required).map((param) => param.name),
    additionalProperties: false,
  };
}

// Path-vs-query wiring is derived from whether the url text actually
// contains `{name}`, not from the descriptor's self-reported `in` — an
// LLM-inferred descriptor's `in` and `url` fields can disagree, and the url
// text is the only source of truth the interpreter actually binds against.
function buildRequest(descriptor: EndpointDescriptor): ServerSpec["tools"][number]["request"] {
  const nonPathParams = descriptor.params.filter((param) => !isPathToken(descriptor.url, param.name));

  if (descriptor.method === "GET") {
    return {
      method: "GET",
      urlTemplate: descriptor.url,
      headers: [{ name: "accept", value: "application/json" }],
      query: nonPathParams.map((param) => ({ key: param.name, param: param.name })),
      body: null,
    };
  }

  return {
    method: "POST",
    urlTemplate: descriptor.url,
    headers: [{ name: "accept", value: "application/json" }],
    query: [],
    body:
      nonPathParams.length > 0
        ? { contentType: "application/json", fields: nonPathParams.map((param) => ({ key: param.name, param: param.name })) }
        : null,
  };
}

// Sanitizes hint names to IDENTIFIER_PATTERN and de-duplicates, since an
// LLM-inferred hint name is free text and may not already be a valid
// identifier (unlike extract.ts's OpenAPI-derived hints, which already are).
function buildResponseFieldSelectors(hints: EndpointDescriptor["responseFieldHints"]) {
  const seen = new Set<string>();
  return hints.map((hint) => {
    const base = toIdentifier(hint.name);
    let name = base;
    let suffix = 2;
    while (seen.has(name)) {
      name = `${base}${suffix}`;
      suffix += 1;
    }
    seen.add(name);
    return { name, path: hint.path };
  });
}

function buildAnnotations(title: string, method: EndpointDescriptor["method"]): ToolAnnotations {
  const isMutating = method === "POST";
  return {
    title,
    readOnlyHint: !isMutating,
    destructiveHint: isMutating,
    idempotentHint: !isMutating,
    openWorldHint: true,
  };
}

/**
 * Deterministically assembles a single-tool ServerSpec from an
 * EndpointDescriptor, whether that descriptor came from OpenAPI extraction
 * or LLM inference — this is the one place that must get DSL-strict
 * patterns (URL_TEMPLATE_PATTERN, IDENTIFIER_PATTERN, etc.) right, so
 * neither upstream source needs to.
 */
export function buildHttpWrapperSpec(descriptor: EndpointDescriptor, request: GenerateRequest): ServerSpec {
  const title = descriptor.summary.slice(0, 128);
  const toolName = toToolName(descriptor.summary);
  const selectors = buildResponseFieldSelectors(descriptor.responseFieldHints);
  const serverName = request.name ?? descriptor.summary.slice(0, 128);

  return {
    name: serverName,
    slug: toSlug(serverName),
    description: buildDescription(descriptor.summary),
    mcpVersion: "2025-06-18",
    tools: [
      {
        name: toolName,
        title,
        description: buildDescription(descriptor.summary),
        annotations: buildAnnotations(title, descriptor.method),
        inputSchema: buildInputSchema(descriptor.params),
        request: buildRequest(descriptor),
        response: {
          fieldSelectors: selectors,
          markdownTemplate: [`**${title}**`, "", ...selectors.map((s) => `- ${s.name}: {{${s.name}}}`)].join("\n"),
        },
        cacheTtlSeconds: descriptor.method === "GET" ? CACHE_TTL_SECONDS : undefined,
      },
    ],
  };
}
