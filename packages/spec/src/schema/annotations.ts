import { z } from "zod";
import { TITLE_PATTERN } from "./constants.js";

// PlayMCP requires all 5 annotation fields present on every tool
// (plan §3 "annotations 5종 필수"); none are optional or defaulted so a
// spec author cannot accidentally omit a hint.
export const toolAnnotationsSchema = z
  .object({
    title: z.string().regex(TITLE_PATTERN),
    readOnlyHint: z.boolean(),
    destructiveHint: z.boolean(),
    idempotentHint: z.boolean(),
    openWorldHint: z.boolean(),
  })
  .strict();

export type ToolAnnotations = z.infer<typeof toolAnnotationsSchema>;
