import { SERVER_STATUSES } from "@mcp-foundry/shared";
import { z } from "zod";
import { rateLimitExceededMarkdown } from "../markdown.js";
import { textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const listMyServersInputShape = {
  status: z.enum(SERVER_STATUSES).optional(),
};

const listMyServersInputSchema = z.object(listMyServersInputShape);
export type ListMyServersInput = z.infer<typeof listMyServersInputSchema>;

export function createListMyServersHandler(ctx: ToolContext) {
  return async (args: ListMyServersInput): Promise<ToolTextResult> => {
    if (!ctx.rateLimiters.query.tryConsume(ctx.userId)) {
      return textResult(rateLimitExceededMarkdown("query"), { isError: true, ctx });
    }

    const servers = await ctx.repos.servers.listByUser(ctx.userId, {
      status: args.status ? [args.status] : undefined,
    });

    if (servers.length === 0) {
      return textResult(
        "### Your MCP servers\n\nYou have no MCP servers yet. Use `create_mcp_server` to create one.",
        { ctx },
      );
    }

    // The ID column is load-bearing, not decorative: it's the only way a
    // caller can obtain the server_id get_server_details/refine_mcp_server/
    // delete_server require (found via task #12's E2E smoke).
    const rows = servers
      .map(
        (server) =>
          `| \`${server.id}\` | ${server.name} | ${server.status} | \`${server.slug}\` | ${server.publicUrl ?? "_pending_"} |`,
      )
      .join("\n");

    return textResult(
      [
        `### Your MCP servers (${servers.length})`,
        "",
        "| ID | Name | Status | Slug | Public URL |",
        "|---|---|---|---|---|",
        rows,
      ].join("\n"),
      { ctx },
    );
  };
}
