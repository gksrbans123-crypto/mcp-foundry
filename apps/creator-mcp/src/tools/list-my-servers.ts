import { SERVER_STATUSES } from "@mcp-foundry/shared";
import { z } from "zod";
import { rateLimitExceededMarkdown } from "../markdown.js";
import { resolveOwnerIdentity, textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const listMyServersInputShape = {
  status: z.enum(SERVER_STATUSES).optional(),
  // Conversation-carried identity (see context.ts resolveOwnerIdentity) —
  // without it, a PlayMCP no-auth call is a brand-new anonymous user whose
  // list is always empty.
  owner_token: z
    .string()
    .min(1)
    .max(512)
    .optional()
    .describe(
      "서버를 만들 때 발급받은 owner token. 전달해야 그 사용자의 서버 목록이 보입니다. 이 대화에서 토큰을 받은 적이 있다면 항상 전달하세요.",
    ),
};

const listMyServersInputSchema = z.object(listMyServersInputShape);
export type ListMyServersInput = z.infer<typeof listMyServersInputSchema>;

export function createListMyServersHandler(baseCtx: ToolContext) {
  return async (args: ListMyServersInput): Promise<ToolTextResult> => {
    if (!baseCtx.rateLimiters.query.tryConsume(baseCtx.userId)) {
      return textResult(rateLimitExceededMarkdown("query"), { isError: true, ctx: baseCtx });
    }

    const ctx = await resolveOwnerIdentity(baseCtx, args.owner_token);

    const servers = await ctx.repos.servers.listByUser(ctx.userId, {
      status: args.status ? [args.status] : undefined,
    });

    if (servers.length === 0) {
      const hint = args.owner_token
        ? ""
        : "\n\n_(무인증 연결에서는 매 호출의 신원이 초기화돼요. 서버를 만들 때 발급받은 owner token을 `owner_token` 인자로 전달하면 그 사용자의 서버가 보입니다.)_";
      return textResult(
        `### Your MCP servers\n\nYou have no MCP servers yet. Use \`create_mcp_server\` to create one.${hint}`,
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
