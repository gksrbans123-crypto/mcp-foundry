import type { LLMClient } from "../llm/types.js";
import type { EndpointDescriptor } from "../types.js";
import { parseJsonLoosely } from "./parse-json.js";
import { inferredDescriptorSchema } from "./schema.js";

const MAX_ATTEMPTS = 2; // initial attempt + 1 retry, per plan §4 "1회 재시도 후 실패 처리"

function buildPrompt(nl: string, previousError: string | null): string {
  const lines = [
    "Translate the following natural-language API request into a single JSON object describing one HTTP endpoint.",
    "Respond with ONLY the JSON object — no markdown fences, no commentary.",
    "Shape (all fields required):",
    '{ "method": "GET"|"POST", "url": string (https, may contain {param} path tokens), ' +
      '"params": [{ "name": string, "type": "string"|"number"|"integer"|"boolean", "description": string, "in": "query"|"path", "required": boolean }], ' +
      '"responseFieldHints": [{ "name": string, "path": string }] (at least one), "summary": string }',
    "The endpoint must require no authentication.",
    "",
    `Request: ${nl}`,
  ];
  if (previousError) {
    lines.push("", `Your previous response was invalid: ${previousError}. Return corrected JSON only.`);
  }
  return lines.join("\n");
}

/**
 * LLM-assisted fallback for when the caller supplied neither an OpenAPI URL
 * nor an endpointDescriptor directly. Only ever asked for the small,
 * easy-to-get-right EndpointDescriptor shape — never the full ServerSpec —
 * so the deterministic wrapper/build-spec.ts remains the single place that
 * assembles DSL-pattern-sensitive fields (URL_TEMPLATE_PATTERN, etc.).
 */
export async function inferEndpointDescriptor(nl: string, llm: LLMClient): Promise<EndpointDescriptor | null> {
  let previousError: string | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const raw = await llm.complete(buildPrompt(nl, previousError));
    const json = parseJsonLoosely(raw);
    if (json === null) {
      previousError = "response was not valid JSON";
      continue;
    }

    const parsed = inferredDescriptorSchema.safeParse(json);
    if (parsed.success) return parsed.data;
    previousError = parsed.error.message;
  }

  return null;
}
