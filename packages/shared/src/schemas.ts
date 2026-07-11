import { z } from "zod";
import { JOB_STAGES, JOB_TYPES, SERVER_STATUSES } from "./status.js";

export const jobStageSchema = z.enum(JOB_STAGES);
export const jobStatusSchema = jobStageSchema;
export const jobTypeSchema = z.enum(JOB_TYPES);
export const serverStatusSchema = z.enum(SERVER_STATUSES);

export const userSchema = z.object({
  id: z.string(),
  authRef: z.string(),
  createdAt: z.string(),
});

export const serverToolSummarySchema = z.object({
  name: z.string(),
  description: z.string(),
});

export const probeResultSchema = z.object({
  passed: z.boolean(),
  measuredAtMs: z.number(),
  maxLatencyMs: z.number(),
  sampleCount: z.number(),
});

export const serverSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  slug: z.string(),
  publicUrl: z.string().nullable(),
  mcpVersion: z.string(),
  status: serverStatusSchema,
  tools: z.array(serverToolSummarySchema),
  probeResult: probeResultSchema.nullable(),
  deployRef: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const jobInputSchema = z.object({
  nl: z.string(),
  openapiUrl: z.string().optional(),
  endpointDescriptor: z.record(z.string(), z.unknown()).optional(),
  /** Optional user-facing server name hint from create_mcp_server's `name`
   * param — a structured field (not folded into `nl`) so
   * packages/generator's template path (GenerateRequest.name) actually
   * receives it. Found missing via task #12's E2E smoke: without this,
   * every unnamed-or-named template-matched request collapsed onto the same
   * default slug, breaking per-job server isolation. */
  name: z.string().optional(),
});

export const jobSchema = z.object({
  id: z.string(),
  userId: z.string(),
  serverId: z.string().nullable(),
  type: jobTypeSchema,
  input: jobInputSchema,
  parsedSpec: z.record(z.string(), z.unknown()).nullable(),
  stage: jobStageSchema,
  status: jobStatusSchema,
  error: z.string().nullable(),
  attempts: z.number().int().nonnegative(),
  lockedAt: z.string().nullable(),
  lockedBy: z.string().nullable(),
  idempotencyKey: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const statusEventSchema = z.object({
  id: z.string(),
  jobId: z.string(),
  step: z.string(),
  status: z.string(),
  message: z.string().nullable(),
  at: z.string(),
});
