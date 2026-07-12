import { z } from "zod";
import { notFoundMarkdown, rateLimitExceededMarkdown } from "../markdown.js";
import { connectionGuideKo } from "./friendly.js";
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

    // Capability-based access by unguessable server_id (see get-job-status.ts):
    // PlayMCP's no-auth host fragments identity per call, so we authorize by
    // knowledge of the id rather than owner match.
    const server = await ctx.repos.servers.findById(args.server_id);
    if (!server) {
      return textResult(notFoundMarkdown("Server", args.server_id), { isError: true, ctx });
    }

    const toolNames = server.tools.map((tool) => tool.name).join(", ") || "_none_";
    const probe = server.probeResult
      ? `${server.probeResult.passed ? "passed" : "failed"} (max ${server.probeResult.maxLatencyMs}ms over ${server.probeResult.sampleCount} samples)`
      : "_not yet run_";

    const isLive = server.status === "active" && Boolean(server.publicUrl);
    return textResult(
      [
        `### ${server.name} (\`${server.slug}\`)`,
        "",
        `- **상태:** ${server.status}`,
        `- **공개 MCP 엔드포인트 (Streamable HTTP):** ${server.publicUrl ?? "_배포 대기 중_"}`,
        `- **MCP 버전:** ${server.mcpVersion}`,
        `- **툴:** ${toolNames}`,
        `- **응답속도 측정:** ${probe}`,
        `- **갱신:** ${server.updatedAt}`,
        ...(isLive ? ["", connectionGuideKo(server)] : []),
      ].join("\n"),
      { ctx },
    );
  };
}
