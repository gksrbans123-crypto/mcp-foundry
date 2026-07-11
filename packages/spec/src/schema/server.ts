import { z } from "zod";
import { MAX_MCP_VERSION, MCP_VERSION_PATTERN, MIN_MCP_VERSION, SLUG_PATTERN, TITLE_PATTERN } from "./constants.js";
import { toolSpecSchema } from "./tool.js";

// Array bound below is a resource-safety cap only (prevents pathologically
// large specs), not the 3–10 recommended / 20 hard-cap business policy from
// plan §8 — that belongs to packages/validator (task #7).
export const serverSpecSchema = z
  .object({
    name: z.string().regex(TITLE_PATTERN),
    slug: z.string().regex(SLUG_PATTERN),
    description: z.string().min(1).max(1024),
    mcpVersion: z.string().regex(MCP_VERSION_PATTERN),
    tools: z.array(toolSpecSchema).min(1).max(50),
  })
  .strict()
  .superRefine((spec, ctx) => {
    if (spec.mcpVersion < MIN_MCP_VERSION || spec.mcpVersion > MAX_MCP_VERSION) {
      ctx.addIssue({
        code: "custom",
        message: `mcpVersion must be between ${MIN_MCP_VERSION} and ${MAX_MCP_VERSION}`,
        path: ["mcpVersion"],
      });
    }

    const seen = new Set<string>();
    spec.tools.forEach((tool, index) => {
      if (seen.has(tool.name)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate tool name "${tool.name}"`,
          path: ["tools", index, "name"],
        });
      }
      seen.add(tool.name);
    });
  });
export type ServerSpec = z.infer<typeof serverSpecSchema>;
