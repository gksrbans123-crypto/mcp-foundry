import { z } from "zod";
import { IDENTIFIER_PATTERN } from "./constants.js";

export const paramTypeSchema = z.enum(["string", "number", "integer", "boolean"]);
export type ParamType = z.infer<typeof paramTypeSchema>;

// A single declared parameter, expressed as a deliberately tiny subset of
// JSON Schema: a flat leaf type plus an optional enum whitelist. No nested
// objects/arrays/$ref — those would reopen the arbitrary-computation surface
// the DSL is designed to exclude (plan §4 "분기·루프·임의 연산 없음").
export const paramPropertySchema = z
  .object({
    type: paramTypeSchema,
    description: z.string().min(1).max(512),
    enum: z.array(z.union([z.string(), z.number()])).min(1).max(64).optional(),
  })
  .strict()
  .superRefine((property, ctx) => {
    if (property.enum === undefined) return;
    if (property.type === "boolean") {
      ctx.addIssue({ code: "custom", message: "enum is not allowed for boolean parameters", path: ["enum"] });
      return;
    }
    property.enum.forEach((value, index) => {
      if (property.type === "string" && typeof value !== "string") {
        ctx.addIssue({
          code: "custom",
          message: `enum[${index}] must be a string to match type "string"`,
          path: ["enum", index],
        });
      }
      if ((property.type === "number" || property.type === "integer") && typeof value !== "number") {
        ctx.addIssue({
          code: "custom",
          message: `enum[${index}] must be a number to match type "${property.type}"`,
          path: ["enum", index],
        });
      }
      if (property.type === "integer" && typeof value === "number" && !Number.isInteger(value)) {
        ctx.addIssue({
          code: "custom",
          message: `enum[${index}] must be an integer to match type "integer"`,
          path: ["enum", index],
        });
      }
    });
  });
export type ParamProperty = z.infer<typeof paramPropertySchema>;

// The tool's MCP `inputSchema`, restricted to object-of-flat-leaves shape.
// `additionalProperties` is a required literal `false` (not merely
// defaulted) so a spec author cannot opt back into accepting arbitrary
// extra fields at call time — this is the "허용 필드 화이트리스트" gate
// from task #3.
export const toolInputSchemaSchema = z
  .object({
    type: z.literal("object"),
    properties: z.record(z.string().regex(IDENTIFIER_PATTERN), paramPropertySchema),
    required: z.array(z.string().regex(IDENTIFIER_PATTERN)),
    additionalProperties: z.literal(false),
  })
  .strict()
  .superRefine((schema, ctx) => {
    const known = new Set(Object.keys(schema.properties));
    schema.required.forEach((name, index) => {
      if (!known.has(name)) {
        ctx.addIssue({
          code: "custom",
          message: `required[${index}] "${name}" is not declared in properties`,
          path: ["required", index],
        });
      }
    });
  });
export type ToolInputSchema = z.infer<typeof toolInputSchemaSchema>;
