import type { ParamProperty, ToolInputSchema } from "@mcp-foundry/spec";

/**
 * Picks a schema-conformant placeholder value for one declared parameter:
 * the first enum member if one is declared, else a type-appropriate
 * default. Used to construct a call the tool's own inputSchema will accept
 * — probing measures round-trip latency, not response semantics, so a
 * placeholder value (not a "real" one) is sufficient and avoids probing
 * needing any tool-specific knowledge.
 */
export function syntheticValueFor(property: ParamProperty): string | number | boolean {
  if (property.enum && property.enum.length > 0) return property.enum[0]!;
  switch (property.type) {
    case "string":
      return "test";
    case "number":
    case "integer":
      return 1;
    case "boolean":
      return false;
  }
}

/** Fills only the *required* parameters — optional ones are left unset, which validateToolArgs already accepts. */
export function buildSyntheticArgs(inputSchema: ToolInputSchema): Record<string, string | number | boolean> {
  const args: Record<string, string | number | boolean> = {};
  for (const name of inputSchema.required) {
    const property = inputSchema.properties[name];
    if (!property) continue;
    args[name] = syntheticValueFor(property);
  }
  return args;
}

/** Same as buildSyntheticArgs but every value stringified — the shape the Inspector CLI's `--tool-arg` flag expects. */
export function buildSyntheticStringArgs(inputSchema: ToolInputSchema): Record<string, string> {
  const raw = buildSyntheticArgs(inputSchema);
  return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value)]));
}
