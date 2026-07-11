import { z } from "zod";
import { FIELD_PATH_PATTERN, IDENTIFIER_PATTERN } from "./constants.js";

// A named selector into the parsed upstream JSON response, e.g.
// { name: "temperature", path: "current.temperature_2m" } or
// { name: "locationBTemp", path: "[1].current.temperature_2m" }.
export const fieldSelectorSchema = z
  .object({
    name: z.string().regex(IDENTIFIER_PATTERN),
    path: z.string().regex(FIELD_PATH_PATTERN).max(128),
  })
  .strict();
export type FieldSelector = z.infer<typeof fieldSelectorSchema>;

const MARKDOWN_TOKEN_PATTERN = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;

// fieldSelectors pick values out of the upstream JSON; markdownTemplate may
// only substitute `{{name}}` tokens for declared selector names — no other
// computation happens here (plan §4 "제한된 치환만").
export const responseSchema = z
  .object({
    fieldSelectors: z.array(fieldSelectorSchema).min(1).max(32),
    markdownTemplate: z.string().min(1).max(4096),
  })
  .strict()
  .superRefine((response, ctx) => {
    const names = new Set<string>();
    response.fieldSelectors.forEach((selector, index) => {
      if (names.has(selector.name)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate fieldSelector name "${selector.name}"`,
          path: ["fieldSelectors", index, "name"],
        });
      }
      names.add(selector.name);
    });

    for (const match of response.markdownTemplate.matchAll(MARKDOWN_TOKEN_PATTERN)) {
      const token = match[1];
      if (token !== undefined && !names.has(token)) {
        ctx.addIssue({
          code: "custom",
          message: `markdownTemplate references undeclared field "${token}"`,
          path: ["markdownTemplate"],
        });
      }
    }
  });
export type ResponseSpec = z.infer<typeof responseSchema>;
