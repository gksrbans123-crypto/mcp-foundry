import { z } from "zod";
import { toolAnnotationsSchema } from "./annotations.js";
import { CACHE_TTL_MAX_SECONDS, NAME_PATTERN } from "./constants.js";
import { toolInputSchemaSchema } from "./input-schema.js";
import { requestSchema } from "./request.js";
import { responseSchema } from "./response.js";

const URL_TEMPLATE_TOKEN_PATTERN = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export const toolSpecSchema = z
  .object({
    name: z.string().regex(NAME_PATTERN),
    title: z.string().min(1).max(128),
    description: z.string().min(1).max(1024),
    annotations: toolAnnotationsSchema,
    inputSchema: toolInputSchemaSchema,
    request: requestSchema,
    response: responseSchema,
    cacheTtlSeconds: z.number().int().min(0).max(CACHE_TTL_MAX_SECONDS).optional(),
  })
  .strict()
  .superRefine((tool, ctx) => {
    const declared = new Set(Object.keys(tool.inputSchema.properties));

    for (const match of tool.request.urlTemplate.matchAll(URL_TEMPLATE_TOKEN_PATTERN)) {
      const token = match[1];
      if (token !== undefined && !declared.has(token)) {
        ctx.addIssue({
          code: "custom",
          message: `urlTemplate references undeclared parameter "${token}"`,
          path: ["request", "urlTemplate"],
        });
      }
    }

    tool.request.query.forEach((mapping, index) => {
      if (mapping.param !== undefined && !declared.has(mapping.param)) {
        ctx.addIssue({
          code: "custom",
          message: `query[${index}] references undeclared parameter "${mapping.param}"`,
          path: ["request", "query", index, "param"],
        });
      }
    });

    tool.request.body?.fields.forEach((mapping, index) => {
      if (mapping.param !== undefined && !declared.has(mapping.param)) {
        ctx.addIssue({
          code: "custom",
          message: `body.fields[${index}] references undeclared parameter "${mapping.param}"`,
          path: ["request", "body", "fields", index, "param"],
        });
      }
    });

    // R4 (cache isolation invariant): only readOnly tools may declare a
    // cache TTL — the interpreter never caches a tool that can mutate
    // upstream state or that has no probe-safe read semantics.
    if (tool.cacheTtlSeconds !== undefined && !tool.annotations.readOnlyHint) {
      ctx.addIssue({
        code: "custom",
        message: "cacheTtlSeconds is only allowed on tools with annotations.readOnlyHint = true",
        path: ["cacheTtlSeconds"],
      });
    }
  });
export type ToolSpec = z.infer<typeof toolSpecSchema>;
