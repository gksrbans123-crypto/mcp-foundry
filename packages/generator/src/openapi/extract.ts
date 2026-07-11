import { toIdentifier } from "../slug.js";
import type { EndpointDescriptor, EndpointDescriptorParam, ParamType } from "../types.js";
import { openApiDocSchema, type OpenApiOperation } from "./schema.js";

const MAX_RESPONSE_FIELD_HINTS = 8;

export interface ExtractHint {
  method?: "GET" | "POST";
  /** Only consider paths containing this substring (case-insensitive). */
  pathContains?: string;
}

function mapParamType(schemaType: string | undefined): ParamType | null {
  switch (schemaType) {
    case "string":
    case "number":
    case "integer":
    case "boolean":
      return schemaType;
    default:
      return null;
  }
}

// Returns null (rather than a partial list) when any parameter falls
// outside the DSL's flat-leaf-type envelope — the caller must skip this
// operation entirely rather than silently drop an unsupported parameter.
function extractParams(operation: OpenApiOperation): EndpointDescriptorParam[] | null {
  const params: EndpointDescriptorParam[] = [];
  for (const param of operation.parameters ?? []) {
    if (param.in !== "query" && param.in !== "path") continue;
    const type = mapParamType(param.schema?.type);
    if (type === null) return null;
    params.push({
      name: param.name,
      type,
      description: param.description ?? param.name,
      in: param.in,
      required: param.required ?? param.in === "path",
    });
  }
  return params;
}

function extractResponseHints(operation: OpenApiOperation): Array<{ name: string; path: string }> | null {
  const schema = operation.responses?.["200"]?.content?.["application/json"]?.schema;
  const properties = schema?.["properties"];
  if (typeof properties !== "object" || properties === null) return null;

  const keys = Object.keys(properties).slice(0, MAX_RESPONSE_FIELD_HINTS);
  if (keys.length === 0) return null;
  return keys.map((key) => ({ name: toIdentifier(key), path: key }));
}

/**
 * Deterministic OpenAPI 3.x extraction (plan §4 "OpenAPI 제공 시 파라미터·
 * 응답 스키마를 결정론적으로 추출"). Only supports GET/POST operations whose
 * parameters and top-level JSON response are flat/primitive — anything
 * requiring nested objects, arrays, or non-JSON responses returns null so
 * the caller can fall back to LLM inference or reject (R7).
 */
export function extractEndpointFromOpenApi(rawDoc: unknown, hint: ExtractHint = {}): EndpointDescriptor | null {
  const parsed = openApiDocSchema.safeParse(rawDoc);
  if (!parsed.success) return null;

  const baseUrl = parsed.data.servers?.[0]?.url;
  if (!baseUrl || !baseUrl.startsWith("https://")) return null;

  for (const [path, methods] of Object.entries(parsed.data.paths)) {
    if (hint.pathContains && !path.toLowerCase().includes(hint.pathContains.toLowerCase())) continue;

    for (const [method, operation] of Object.entries(methods)) {
      const upperMethod = method.toUpperCase();
      if (upperMethod !== "GET" && upperMethod !== "POST") continue;
      if (hint.method && hint.method !== upperMethod) continue;

      const params = extractParams(operation);
      const responseFieldHints = extractResponseHints(operation);
      if (params === null || responseFieldHints === null) continue;

      return {
        method: upperMethod,
        url: `${baseUrl.replace(/\/$/, "")}${path}`,
        params,
        responseFieldHints,
        summary: operation.summary ?? operation.description ?? `${upperMethod} ${path}`,
      };
    }
  }

  return null;
}
