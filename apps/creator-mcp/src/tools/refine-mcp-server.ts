import { z } from "zod";
import { notFoundMarkdown, rateLimitExceededMarkdown } from "../markdown.js";
import { buildJobStatusUrl, buildServerDetailUrl } from "../urls.js";
import { resolveOwnerIdentity, textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const refineMcpServerInputShape = {
  server_id: z.string().min(1),
  spec_text: z.string().min(1).max(20_000),
  // Conversation-carried identity (see context.ts resolveOwnerIdentity) —
  // keeps the response's dashboard links on the caller's own account.
  owner_token: z
    .string()
    .min(1)
    .max(512)
    .optional()
    .describe("서버를 만들 때 발급받은 owner token. 이 대화에서 토큰을 받은 적이 있다면 항상 전달하세요."),
};

const refineMcpServerInputSchema = z.object(refineMcpServerInputShape);
export type RefineMcpServerInput = z.infer<typeof refineMcpServerInputSchema>;

export function createRefineMcpServerHandler(baseCtx: ToolContext) {
  return async (args: RefineMcpServerInput): Promise<ToolTextResult> => {
    if (!baseCtx.rateLimiters.mutate.tryConsume(baseCtx.rateLimitKey)) {
      return textResult(rateLimitExceededMarkdown("mutate"), { isError: true, ctx: baseCtx });
    }

    const ctx = await resolveOwnerIdentity(baseCtx, args.owner_token);

    // Capability-based access by unguessable server_id (see get-job-status.ts):
    // identity is fragmented per call under PlayMCP no-auth, so knowledge of
    // the id authorizes the rebuild rather than an owner match.
    const server = await ctx.repos.servers.findById(args.server_id);
    if (!server) {
      return textResult(notFoundMarkdown("Server", args.server_id), { isError: true, ctx });
    }

    const job = await ctx.repos.queue.enqueue({
      // The rebuild job follows the SERVER's owner, not this call's throwaway
      // anonymous identity — so the refine shows up in the same account as the
      // server it modifies (list/dashboard stay coherent).
      userId: server.userId,
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
        // Server DETAIL page, not the owner-scoped /servers list: detail pages
        // are capability-based (id is the gate), so this link shows the refine
        // pipeline + job history no matter which token rides along.
        `- **Dashboard:** ${buildServerDetailUrl(ctx.dashboardBaseUrl, ctx.token, server.id)}`,
        "",
        "Use `get_job_status` with this job id to track progress.",
      ].join("\n"),
      { ctx },
    );
  };
}
