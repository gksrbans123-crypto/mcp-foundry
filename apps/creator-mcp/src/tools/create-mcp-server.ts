import { z } from "zod";
import { rateLimitExceededMarkdown } from "../markdown.js";
import { buildJobStatusUrl, buildServersUrl } from "../urls.js";
import { textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const createMcpServerInputShape = {
  spec_text: z.string().min(1, "spec_text is required").max(20_000),
  // https-only is defense in depth (security review HIGH-1) — the actual
  // SSRF/DNS-rebinding guard runs at fetch time in apps/worker's
  // createGuardedOpenApiFetcher, not here; this just fails the request
  // fast and with a clear message for the common non-https case.
  openapi_url: z
    .string()
    .url()
    .refine((url) => new URL(url).protocol === "https:", { message: "openapi_url must use https" })
    .optional(),
  endpoint_descriptor: z.record(z.string(), z.unknown()).optional(),
  name: z.string().min(1).max(128).optional(),
};

const createMcpServerInputSchema = z.object(createMcpServerInputShape);
export type CreateMcpServerInput = z.infer<typeof createMcpServerInputSchema>;

export function createCreateMcpServerHandler(ctx: ToolContext) {
  return async (args: CreateMcpServerInput): Promise<ToolTextResult> => {
    if (!ctx.rateLimiters.mutate.tryConsume(ctx.rateLimitKey)) {
      return textResult(rateLimitExceededMarkdown("mutate"), { isError: true, ctx });
    }

    const job = await ctx.repos.queue.enqueue({
      userId: ctx.userId,
      type: "create",
      input: {
        nl: args.spec_text,
        openapiUrl: args.openapi_url,
        endpointDescriptor: args.endpoint_descriptor,
        name: args.name,
      },
    });

    return textResult(
      [
        "### Job queued",
        "",
        `- **Job ID:** \`${job.id}\``,
        `- **Status URL:** ${buildJobStatusUrl(ctx.dashboardBaseUrl, ctx.token, job.id)}`,
        `- **Dashboard:** ${buildServersUrl(ctx.dashboardBaseUrl, ctx.token)}`,
        "",
        "Use `get_job_status` with this job id to track progress.",
      ].join("\n"),
      { ctx },
    );
  };
}
