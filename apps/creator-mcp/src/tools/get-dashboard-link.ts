import { z } from "zod";
import { rateLimitExceededMarkdown } from "../markdown.js";
import { buildServerDetailUrl, buildServersUrl } from "../urls.js";
import { resolveOwnerIdentity, textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const getDashboardLinkInputShape = {
  server_id: z.string().min(1).optional(),
  // Conversation-carried identity (see context.ts): without it the link is
  // built with this call's fresh anonymous token and opens an empty account.
  owner_token: z
    .string()
    .min(1)
    .max(512)
    .optional()
    .describe("서버를 만들 때 발급받은 owner token. 전달하면 그 사용자의 대시보드 링크가 만들어집니다. 이 대화에서 토큰을 받은 적이 있다면 항상 전달하세요."),
};

const getDashboardLinkInputSchema = z.object(getDashboardLinkInputShape);
export type GetDashboardLinkInput = z.infer<typeof getDashboardLinkInputSchema>;

export function createGetDashboardLinkHandler(baseCtx: ToolContext) {
  return async (args: GetDashboardLinkInput): Promise<ToolTextResult> => {
    if (!baseCtx.rateLimiters.query.tryConsume(baseCtx.userId)) {
      return textResult(rateLimitExceededMarkdown("query"), { isError: true, ctx: baseCtx });
    }

    const ctx = await resolveOwnerIdentity(baseCtx, args.owner_token);

    // Capability-based like the other by-id tools: knowing the unguessable
    // server_id is the gate (PlayMCP no-auth fragments identity per call).
    let ownedServerId: string | undefined;
    if (args.server_id) {
      const server = await ctx.repos.servers.findById(args.server_id);
      if (server) {
        ownedServerId = server.id;
      }
    }

    const url = ownedServerId
      ? buildServerDetailUrl(ctx.dashboardBaseUrl, ctx.token, ownedServerId)
      : buildServersUrl(ctx.dashboardBaseUrl, ctx.token);

    return textResult(`### 대시보드\n\n내 MCP 서버와 빌드 진행 상황을 웹에서 확인하세요:\n\n${url}`, { ctx });
  };
}
