import { z } from "zod";
import { notFoundMarkdown, rateLimitExceededMarkdown } from "../markdown.js";
import { textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const getJobStatusInputShape = {
  job_id: z.string().min(1),
};

const getJobStatusInputSchema = z.object(getJobStatusInputShape);
export type GetJobStatusInput = z.infer<typeof getJobStatusInputSchema>;

export function createGetJobStatusHandler(ctx: ToolContext) {
  return async (args: GetJobStatusInput): Promise<ToolTextResult> => {
    if (!ctx.rateLimiters.query.tryConsume(ctx.userId)) {
      return textResult(rateLimitExceededMarkdown("query"), { isError: true, ctx });
    }

    const job = await ctx.repos.jobs.findById(args.job_id);
    if (!job || job.userId !== ctx.userId) {
      return textResult(notFoundMarkdown("Job", args.job_id), { isError: true, ctx });
    }

    return textResult(
      [
        `### Job \`${job.id}\``,
        "",
        `- **Type:** ${job.type}`,
        // Without this, a caller has no way to discover the server_id needed
        // by get_server_details/refine_mcp_server/delete_server — found via
        // task #12's E2E smoke, which needs exactly this to track a create
        // job through to its deployed server.
        `- **Server ID:** ${job.serverId ? `\`${job.serverId}\`` : "_none yet_"}`,
        `- **Stage:** ${job.stage}`,
        `- **Status:** ${job.status}`,
        `- **Attempts:** ${job.attempts}`,
        `- **Error:** ${job.error ?? "_none_"}`,
        `- **Updated:** ${job.updatedAt}`,
      ].join("\n"),
      { ctx },
    );
  };
}
