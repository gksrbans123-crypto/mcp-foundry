import { z } from "zod";
import { notFoundMarkdown, rateLimitExceededMarkdown } from "../markdown.js";
import { buildJobStatusUrl, buildServerDetailUrl, buildServersUrl } from "../urls.js";
import { connectionGuideKo, stageLabelKo } from "./friendly.js";
import { textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const getJobStatusInputShape = {
  job_id: z.string().min(1),
};

const getJobStatusInputSchema = z.object(getJobStatusInputShape);
export type GetJobStatusInput = z.infer<typeof getJobStatusInputSchema>;

export function createGetJobStatusHandler(ctx: ToolContext) {
  return async (args: GetJobStatusInput): Promise<ToolTextResult> => {
    if (!ctx.rateLimiters.query.tryConsume(ctx.userId)) {
      return textResult(rateLimitExceededMarkdown("query"), { isError: true, ctx });
    }

    const job = await ctx.repos.jobs.findById(args.job_id);
    if (!job || job.userId !== ctx.userId) {
      return textResult(notFoundMarkdown("Job", args.job_id), { isError: true, ctx });
    }

    // ✅ Done: surface the live endpoint + how to connect, so the caller can
    // use the generated server immediately.
    if (job.stage === "active" && job.serverId) {
      const server = await ctx.repos.servers.findById(job.serverId);
      if (server?.publicUrl) {
        return textResult(
          [
            "### ✅ 배포 완료! 바로 쓸 수 있어요",
            "",
            `- **서버:** ${server.name} (\`${server.slug}\`)`,
            `- **서버 ID:** \`${server.id}\``,
            "- **공개 MCP 엔드포인트 (Streamable HTTP):**",
            `  ${server.publicUrl}`,
            "",
            connectionGuideKo(server),
            "",
            `상세 정보: ${buildServerDetailUrl(ctx.dashboardBaseUrl, ctx.token, server.id)}`,
          ].join("\n"),
          { ctx },
        );
      }
    }

    // ❌ Failed
    if (job.stage === "failed") {
      return textResult(
        [
          "### ❌ 생성에 실패했어요",
          "",
          `- **사유:** ${job.error ?? "알 수 없는 오류"}`,
          `- **작업 ID:** \`${job.id}\``,
          "",
          `자세한 로그: ${buildJobStatusUrl(ctx.dashboardBaseUrl, ctx.token, job.id)}`,
        ].join("\n"),
        { ctx },
      );
    }

    // ⏳ In progress
    return textResult(
      [
        `### ⏳ 만드는 중이에요 — ${stageLabelKo(job.stage)}`,
        "",
        "Streamable HTTP MCP 엔드포인트를 생성하고 있습니다. 보통 20~30초면 완료돼요.",
        "",
        `- **작업 ID:** \`${job.id}\``,
        `- **현재 단계:** ${stageLabelKo(job.stage)} (\`${job.stage}\`)`,
        `- **진행 상황(웹):** ${buildServersUrl(ctx.dashboardBaseUrl, ctx.token)}`,
        "",
        "잠시 후 `get_job_status`로 다시 확인하면 연결용 공개 URL을 드릴게요.",
      ].join("\n"),
      { ctx },
    );
  };
}
