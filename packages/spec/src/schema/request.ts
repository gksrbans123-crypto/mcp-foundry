import { z } from "zod";
import { ALLOWED_HEADER_NAMES, IDENTIFIER_PATTERN, URL_TEMPLATE_PATTERN, WIRE_KEY_PATTERN } from "./constants.js";

export const httpMethodSchema = z.enum(["GET", "POST"]);
export type HttpMethod = z.infer<typeof httpMethodSchema>;

// Headers are static key/value pairs authored by the spec (template or
// Generator), never bound to caller-supplied parameters — this keeps the
// header surface out of the parameter-injection threat model entirely.
export const requestHeaderSchema = z
  .object({
    name: z.enum(ALLOWED_HEADER_NAMES),
    value: z.string().min(1).max(256),
  })
  .strict();
export type RequestHeader = z.infer<typeof requestHeaderSchema>;

// A single wire-key mapping: either a fixed constant `value` authored by the
// spec, or a `param` reference resolved from validated call arguments at
// execution time. Exactly one of the two must be set — never both, never
// neither — so there is no ambiguity about where a value comes from.
function paramOrValueMapping(keyPattern: RegExp) {
  return z
    .object({
      key: z.string().regex(keyPattern),
      param: z.string().regex(IDENTIFIER_PATTERN).optional(),
      value: z.string().max(256).optional(),
    })
    .strict()
    .superRefine((mapping, ctx) => {
      const hasParam = mapping.param !== undefined;
      const hasValue = mapping.value !== undefined;
      if (hasParam === hasValue) {
        ctx.addIssue({
          code: "custom",
          message: "exactly one of param or value must be set",
        });
      }
    });
}

export const queryMappingSchema = paramOrValueMapping(WIRE_KEY_PATTERN);
export type QueryMapping = z.infer<typeof queryMappingSchema>;

export const bodyFieldMappingSchema = paramOrValueMapping(WIRE_KEY_PATTERN);
export type BodyFieldMapping = z.infer<typeof bodyFieldMappingSchema>;

export const requestBodySchema = z
  .object({
    contentType: z.literal("application/json"),
    fields: z.array(bodyFieldMappingSchema).max(32),
  })
  .strict();

// method/urlTemplate/headers/query/body describing exactly how to call the
// upstream API. urlTemplate carries only path placeholders (see
// URL_TEMPLATE_PATTERN) — query strings are always built from `query`
// through URLSearchParams, never concatenated into the template.
export const requestSchema = z
  .object({
    method: httpMethodSchema,
    urlTemplate: z.string().regex(URL_TEMPLATE_PATTERN).max(2048),
    headers: z.array(requestHeaderSchema).max(8).default([]),
    query: z.array(queryMappingSchema).max(16).default([]),
    body: requestBodySchema.nullable().default(null),
  })
  .strict()
  .superRefine((request, ctx) => {
    if (request.method === "GET" && request.body !== null) {
      ctx.addIssue({ code: "custom", message: "GET requests must not declare a body", path: ["body"] });
    }
  });
export type RequestSpec = z.infer<typeof requestSchema>;
