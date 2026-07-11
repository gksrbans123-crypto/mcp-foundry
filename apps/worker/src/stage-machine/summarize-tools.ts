import type { ServerToolSummary } from "@mcp-foundry/shared";
import type { ToolSpec } from "@mcp-foundry/spec";

/** servers.tools stores only name+description (dashboard listing) — the full
 * executable spec lives in jobs.parsed_spec and the deployed spec file. */
export function summarizeTools(tools: readonly ToolSpec[]): ServerToolSummary[] {
  return tools.map((tool) => ({ name: tool.name, description: tool.description }));
}
