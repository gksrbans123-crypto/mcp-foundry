import { z } from "zod";
import { notFoundMarkdown, rateLimitExceededMarkdown } from "../markdown.js";
import { buildJobStatusUrl, buildServersUrl } from "../urls.js";
import { textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const refineMcpServerInputShape = {
  server_id: z.string().min(1),
  spec_text: z.string().min(1).max(20_000),
};

const refineMcpServerInputSchema = z.object(refineMcpServerInputShape);
export type RefineMcpServerInput = z.infer<typeof refineMcpServerInputSchema>;

export function createRefineMcpServerHandler(ctx: ToolContext) {
  return async (args: RefineMcpServerInput): Promise<ToolTextResult> => {
    if (!ctx.rateLimiters.mutate.tryConsume(ctx.rateLimitKey)) {
      return textResult(rateLimitExceededMarkdown("mutate"), { isError: true, ctx });
    }

    // Capability-based access by unguessable server_id (see get-job-status.ts):
    // identity is fragmented per call under PlayMCP no-auth, so knowledge of
    // the id authorizes the rebuild rather than an owner match.
    const server = await ctx.repos.servers.findById(args.server_id);
    if (!server) {
      return textResult(notFoundMarkdown("Server", args.server_id), { isError: true, ctx });
    }

    const job = await ctx.repos.queue.enqueue({
      userId: ctx.userId,
      serverId: server.id,
      type: "refine",
      input: { nl: args.spec_text },
    });

    return textResult(
      [
        "### Refine job queued",
        "",
        `- **Job ID:** \`${job.id}\``,
        `- **Server:** ${server.name} (\`${server.slug}\`)`,
        `- **Status URL:** ${buildJobStatusUrl(ctx.dashboardBaseUrl, ctx.token, job.id)}`,
        `- **Dashboard:** ${buildServersUrl(ctx.dashboardBaseUrl, ctx.token)}`,
        "",
        "Use `get_job_status` with this job id to track progress.",
      ].join("\n"),
      { ctx },
    );
  };
}
