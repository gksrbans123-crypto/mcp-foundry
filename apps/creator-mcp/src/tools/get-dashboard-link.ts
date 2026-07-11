import { z } from "zod";
import { rateLimitExceededMarkdown } from "../markdown.js";
import { buildServerDetailUrl, buildServersUrl } from "../urls.js";
import { textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const getDashboardLinkInputShape = {
  server_id: z.string().min(1).optional(),
};

const getDashboardLinkInputSchema = z.object(getDashboardLinkInputShape);
export type GetDashboardLinkInput = z.infer<typeof getDashboardLinkInputSchema>;

export function createGetDashboardLinkHandler(ctx: ToolContext) {
  return async (args: GetDashboardLinkInput): Promise<ToolTextResult> => {
    if (!ctx.rateLimiters.query.tryConsume(ctx.userId)) {
      return textResult(rateLimitExceededMarkdown("query"), { isError: true, ctx });
    }

    let ownedServerId: string | undefined;
    if (args.server_id) {
      const server = await ctx.repos.servers.findById(args.server_id);
      if (server && server.userId === ctx.userId) {
        ownedServerId = server.id;
      }
    }

    const url = ownedServerId
      ? buildServerDetailUrl(ctx.dashboardBaseUrl, ctx.token, ownedServerId)
      : buildServersUrl(ctx.dashboardBaseUrl, ctx.token);

    return textResult(`### Dashboard\n\n${url}`, { ctx });
  };
}
