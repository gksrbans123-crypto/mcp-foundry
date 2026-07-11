import { z } from "zod";

// Deliberately loose/partial: only the subset of OpenAPI 3.x this
// extractor understands, validated defensively since the document comes
// from an untrusted, caller-supplied URL.
const jsonSchemaLikeSchema = z.record(z.string(), z.unknown());

const openApiParamSchema = z.object({
  name: z.string(),
  in: z.enum(["query", "path", "header", "cookie"]),
  required: z.boolean().optional(),
  description: z.string().optional(),
  schema: z.object({ type: z.string().optional() }).optional(),
});

const mediaTypeSchema = z.object({ schema: jsonSchemaLikeSchema.optional() });

const openApiOperationSchema = z.object({
  summary: z.string().optional(),
  description: z.string().optional(),
  parameters: z.array(openApiParamSchema).optional(),
  requestBody: z.object({ content: z.record(z.string(), mediaTypeSchema).optional() }).optional(),
  responses: z.record(z.string(), z.object({ content: z.record(z.string(), mediaTypeSchema).optional() })).optional(),
});

export const openApiDocSchema = z.object({
  servers: z.array(z.object({ url: z.string() })).optional(),
  paths: z.record(z.string(), z.record(z.string(), openApiOperationSchema)),
});

export type OpenApiDoc = z.infer<typeof openApiDocSchema>;
export type OpenApiOperation = z.infer<typeof openApiOperationSchema>;
