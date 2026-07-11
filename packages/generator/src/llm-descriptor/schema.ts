import { z } from "zod";

export const descriptorParamSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "number", "integer", "boolean"]),
  description: z.string().min(1),
  in: z.enum(["query", "path"]),
  required: z.boolean(),
});

export const inferredDescriptorSchema = z.object({
  method: z.enum(["GET", "POST"]),
  url: z.string().min(1),
  params: z.array(descriptorParamSchema),
  responseFieldHints: z.array(z.object({ name: z.string().min(1), path: z.string().min(1) })).min(1),
  summary: z.string().min(1),
});
