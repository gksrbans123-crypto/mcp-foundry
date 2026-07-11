import { z } from "zod";
import { rateLimitExceededMarkdown } from "../markdown.js";
import { buildJobStatusUrl, buildServersUrl } from "../urls.js";
import { textResult, type ToolContext, type ToolTextResult } from "./context.js";

export const createMcpServerInputShape = {
  spec_text: z.string().min(1, "spec_text is required").max(20_000),
  // https-only is defense in depth (security review HIGH-1) — the actual
  // SSRF/DNS-rebinding guard runs at fetch time in apps/worker's
  // createGuardedOpenApiFetcher, not here; this just fails the request
  // fast and with a clear message for the common non-https case.
  openapi_url: z
    .string()
    .url()
    .refine((url) => new URL(url).protocol === "https:", { message: "openapi_url must use https" })
    .optional(),
  endpoint_descriptor: z.record(z.string(), z.unknown()).optional(),
  name: z.string().min(1).max(128).optional(),
};

const createMcpServerInputSchema = z.object(createMcpServerInputShape);
export type CreateMcpServerInput = z.infer<typeof createMcpServerInputSchema>;

export function createCreateMcpServerHandler(ctx: ToolContext) {
  return async (args: CreateMcpServerInput): Promise<ToolTextResult> => {
    if (!ctx.rateLimiters.mutate.tryConsume(ctx.rateLimitKey)) {
      return textResult(rateLimitExceededMarkdown("mutate"), { isError: true, ctx });
    }

    const job = await ctx.repos.queue.enqueue({
      userId: ctx.userId,
      type: "create",
      input: {
        nl: args.spec_text,
        openapiUrl: args.openapi_url,
        endpointDescriptor: args.endpoint_descriptor,
        name: args.name,
      },
    });

    return textResult(
      [
        "### 🛠️ MCP 서버를 만들고 있어요!",
        "",
        "요청하신 서버의 **Streamable HTTP MCP 엔드포인트**를 생성하는 중입니다.",
        "스펙 생성 → MCP 표준 검증(Inspector) → 응답속도 측정 → 공개 URL 배포까지 보통 **20~30초** 걸려요.",
        "",
        `- **작업 ID:** \`${job.id}\``,
        `- 🔗 **진행 상황 보기(이 작업 파이프라인):** ${buildJobStatusUrl(ctx.dashboardBaseUrl, ctx.token, job.id)}`,
        `- 📊 **대시보드(내 MCP 서버 전체):** ${buildServersUrl(ctx.dashboardBaseUrl, ctx.token)}`,
        "",
        "위 **두 링크**를 안내해 주세요 — 하나는 지금 만드는 작업의 실시간 진행 상황, 다른 하나는 내 서버 전체를 관리하는 대시보드예요.",
        `잠시 뒤 \`get_job_status\`(작업 ID \`${job.id}\`)를 호출하면 **바로 연결해서 쓸 수 있는 공개 URL**을 알려드려요.`,
      ].join("\n"),
      { ctx },
    );
  };
}
