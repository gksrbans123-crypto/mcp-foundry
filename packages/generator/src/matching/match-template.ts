import type { LLMClient } from "../llm/types.js";
import type { Template } from "../templates/types.js";

function buildClassifyPrompt(nl: string, ids: string[]): string {
  return [
    "You are classifying a natural-language MCP server request into one of a fixed set of template ids.",
    `Template ids: ${ids.join(", ")}, or "none" if no template fits.`,
    "Respond with exactly one id and nothing else — no punctuation, no explanation.",
    "",
    `Request: ${nl}`,
  ].join("\n");
}

/**
 * Plan §4 "NL 키워드+LLM 분류로 매칭": a fast, deterministic keyword pass
 * first (works with any LLMClient, including offline tests); only falls
 * back to an LLM classification call when no keyword hits.
 */
export async function matchTemplate(nl: string, templates: Template[], llm: LLMClient): Promise<Template | null> {
  const lower = nl.toLowerCase();
  const keywordMatch = templates.find((template) => template.keywords.some((keyword) => lower.includes(keyword.toLowerCase())));
  if (keywordMatch) return keywordMatch;

  const raw = (await llm.complete(buildClassifyPrompt(nl, templates.map((template) => template.id)))).trim().toLowerCase();
  return templates.find((template) => template.id === raw) ?? null;
}
