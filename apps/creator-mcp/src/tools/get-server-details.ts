import { z } from "zod";
import { notFoundMarkdown, rateLimitExceededMarkdown } from "../markdown.js";
import { textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const getServerDetailsInputShape = {
  server_id: z.string().min(1),
};

const getServerDetailsInputSchema = z.object(getServerDetailsInputShape);
export type GetServerDetailsInput = z.infer<typeof getServerDetailsInputSchema>;

export function createGetServerDetailsHandler(ctx: ToolContext) {
  return async (args: GetServerDetailsInput): Promise<ToolTextResult> => {
    if (!ctx.rateLimiters.query.tryConsume(ctx.userId)) {
      return textResult(rateLimitExceededMarkdown("query"), { isError: true, ctx });
    }

    const server = await ctx.repos.servers.findById(args.server_id);
    if (!server || server.userId !== ctx.userId) {
      return textResult(notFoundMarkdown("Server", args.server_id), { isError: true, ctx });
    }

    const toolNames = server.tools.map((tool) => tool.name).join(", ") || "_none_";
    const probe = server.probeResult
      ? `${server.probeResult.passed ? "passed" : "failed"} (max ${server.probeResult.maxLatencyMs}ms over ${server.probeResult.sampleCount} samples)`
      : "_not yet run_";

    return textResult(
      [
        `### Server: ${server.name} (\`${server.slug}\`)`,
        "",
        `- **Status:** ${server.status}`,
        `- **Public URL:** ${server.publicUrl ?? "_pending_"}`,
        `- **MCP Version:** ${server.mcpVersion}`,
        `- **Tools:** ${toolNames}`,
        `- **Probe:** ${probe}`,
        `- **Deploy ref:** ${server.deployRef ?? "_none_"}`,
        `- **Updated:** ${server.updatedAt}`,
      ].join("\n"),
      { ctx },
    );
  };
}
