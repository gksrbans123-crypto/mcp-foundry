import type { ParamProperty, ToolInputSchema } from "@mcp-foundry/spec";
import { z } from "zod";

function baseSchemaFor(property: ParamProperty): z.ZodTypeAny {
  if (property.enum !== undefined && property.type === "string") {
    const [first, ...rest] = property.enum as string[];
    if (first !== undefined) return z.enum([first, ...rest]);
  }
  if (property.enum !== undefined) {
    const literals = property.enum.map((value) => z.literal(value));
    const [first, second, ...rest] = literals;
    if (first !== undefined && second !== undefined) return z.union([first, second, ...rest]);
    if (first !== undefined) return first;
  }

  switch (property.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
  }
}

/**
 * Converts a tool's restricted-JSON-Schema `inputSchema` (packages/spec) into
 * the Zod raw shape the MCP SDK's `registerTool` expects, for the ephemeral
 * pre-publish compliance server (see ephemeral-server.ts).
 *
 * Ported from apps/runtime-host/src/mcp/schema-to-zod.ts — see the
 * duplication note in ../egress/ip-range-check.ts.
 */
export function toZodShape(inputSchema: ToolInputSchema): Record<string, z.ZodTypeAny> {
  const required = new Set(inputSchema.required);
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [name, property] of Object.entries(inputSchema.properties)) {
    const base = baseSchemaFor(property).describe(property.description);
    shape[name] = required.has(name) ? base : base.optional();
  }
  return shape;
}
