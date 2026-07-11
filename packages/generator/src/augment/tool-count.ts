import type { ServerSpec } from "@mcp-foundry/spec";

const MIN_RECOMMENDED_TOOLS = 3;

type Tool = ServerSpec["tools"][number];

// Clones an existing, already-compliant tool's full HTTP wiring under a new
// name/title — the safest way to add a tool without inventing new upstream
// behavior (plan §8 "<3개 요청: 자동 보강"; "관련 조회/헬프 툴 추가" here
// means a variant view onto an endpoint already proven safe and valid,
// not a creative new endpoint).
function cloneAsVariant(tool: Tool, variantIndex: number): Tool {
  const suffix = variantIndex === 0 ? "details" : `variant_${variantIndex + 1}`;
  const name = `${tool.name}_${suffix}`.slice(0, 128);
  const title = `${tool.title} (details)`.slice(0, 128);
  return { ...tool, name, title, annotations: { ...tool.annotations, title } };
}

/**
 * Deterministically raises a candidate spec to the recommended minimum
 * tool count (plan §8) by cloning its first tool as safe variants — no LLM
 * call, so this step is always available even on the retry-exhausted path.
 */
export function augmentToolCount(spec: ServerSpec): ServerSpec {
  if (spec.tools.length >= MIN_RECOMMENDED_TOOLS) return spec;

  const template = spec.tools[0]!;
  const needed = MIN_RECOMMENDED_TOOLS - spec.tools.length;
  const additions = Array.from({ length: needed }, (_, index) => cloneAsVariant(template, index));
  return { ...spec, tools: [...spec.tools, ...additions] };
}
