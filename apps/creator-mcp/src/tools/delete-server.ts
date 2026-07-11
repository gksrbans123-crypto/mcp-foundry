import { z } from "zod";
import { notFoundMarkdown, rateLimitExceededMarkdown } from "../markdown.js";
import { buildJobStatusUrl } from "../urls.js";
import { textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const deleteServerInputShape = {
  server_id: z.string().min(1),
};

const deleteServerInputSchema = z.object(deleteServerInputShape);
export type DeleteServerInput = z.infer<typeof deleteServerInputSchema>;

export function createDeleteServerHandler(ctx: ToolContext) {
  return async (args: DeleteServerInput): Promise<ToolTextResult> => {
    if (!ctx.rateLimiters.mutate.tryConsume(ctx.rateLimitKey)) {
      return textResult(rateLimitExceededMarkdown("mutate"), { isError: true, ctx });
    }

    const server = await ctx.repos.servers.findById(args.server_id);
    if (!server || server.userId !== ctx.userId) {
      return textResult(notFoundMarkdown("Server", args.server_id), { isError: true, ctx });
    }

    // Idempotent: re-deleting an already-deleted server is a no-op, not an error.
    if (server.status === "deleted") {
      return textResult(`### Already deleted\n\nServer \`${server.id}\` is already deleted — no action taken.`, {
        ctx,
      });
    }

    const job = await ctx.repos.queue.enqueue({
      userId: ctx.userId,
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
