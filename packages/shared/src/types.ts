import type { z } from "zod";
import type {
  jobInputSchema,
  jobSchema,
  probeResultSchema,
  serverSchema,
  serverToolSummarySchema,
  statusEventSchema,
  userSchema,
} from "./schemas.js";

// Types are derived from the zod schemas (schemas.ts) rather than
// hand-duplicated, so validation and static types can never drift apart.
export type User = z.infer<typeof userSchema>;
export type ServerToolSummary = z.infer<typeof serverToolSummarySchema>;
export type ProbeResult = z.infer<typeof probeResultSchema>;
export type Server = z.infer<typeof serverSchema>;
export type JobInput = z.infer<typeof jobInputSchema>;
export type Job = z.infer<typeof jobSchema>;
export type StatusEvent = z.infer<typeof statusEventSchema>;
