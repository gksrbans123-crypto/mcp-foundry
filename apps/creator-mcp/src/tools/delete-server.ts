import { z } from "zod";
import { notFoundMarkdown, rateLimitExceededMarkdown } from "../markdown.js";
import { buildJobStatusUrl } from "../urls.js";
import { resolveOwnerIdentity, textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const deleteServerInputShape = {
  server_id: z.string().min(1),
  // Conversation-carried identity (see context.ts resolveOwnerIdentity).
  owner_token: z
    .string()
    .min(1)
    .max(512)
    .optional()
    .describe("서버를 만들 때 발급받은 owner token. 이 대화에서 토큰을 받은 적이 있다면 항상 전달하세요."),
};

const deleteServerInputSchema = z.object(deleteServerInputShape);
export type DeleteServerInput = z.infer<typeof deleteServerInputSchema>;

export function createDeleteServerHandler(baseCtx: ToolContext) {
  return async (args: DeleteServerInput): Promise<ToolTextResult> => {
    if (!baseCtx.rateLimiters.mutate.tryConsume(baseCtx.rateLimitKey)) {
      return textResult(rateLimitExceededMarkdown("mutate"), { isError: true, ctx: baseCtx });
    }

    const ctx = await resolveOwnerIdentity(baseCtx, args.owner_token);

    // Capability-based access by unguessable server_id (see get-job-status.ts):
    // identity is fragmented per call under PlayMCP no-auth, so the creator can
    // only delete their own server by presenting its id — knowledge of the id
    // is the gate rather than an owner match.
    const server = await ctx.repos.servers.findById(args.server_id);
    if (!server) {
      return textResult(notFoundMarkdown("Server", args.server_id), { isError: true, ctx });
    }

    // Idempotent: re-deleting an already-deleted server is a no-op, not an error.
    if (server.status === "deleted") {
      return textResult(`### Already deleted\n\nServer \`${server.id}\` is already deleted — no action taken.`, {
        ctx,
      });
    }

    const job = await ctx.repos.queue.enqueue({
      // The teardown job follows the SERVER's owner (see refine-mcp-server.ts)
      // so it stays in the same account as the server it removes.
      userId: server.userId,
      serverId: server.id,
      type: "delete",
      input: { nl: `Delete server ${server.slug}` },
    });

    return textResult(
      [
        "### Delete job queued",
        "",
        `- **Job ID:** \`${job.id}\``,
        `- **Server:** ${server.name} (\`${server.slug}\`)`,
        `- **Status URL:** ${buildJobStatusUrl(ctx.dashboardBaseUrl, ctx.token, job.id)}`,
      ].join("\n"),
      { ctx },
    );
  };
}
