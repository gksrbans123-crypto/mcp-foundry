import { z } from "zod";
import { rateLimitExceededMarkdown } from "../markdown.js";
import { buildJobStatusUrl, buildServersUrl } from "../urls.js";
import { resolveOwnerIdentity, textResult, type ToolContext, type ToolTextResult } from "./context.js";

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
  // Conversation-carried identity (see context.ts resolveOwnerIdentity):
  // PlayMCP no-auth keeps nothing between calls, so the assistant passes the
  // previously issued token back here to keep every server under one owner.
  owner_token: z
    .string()
    .min(1)
    .max(512)
    .optional()
    .describe(
      "이전 응답에서 발급받은 owner token. 전달하면 같은 사용자 소유로 서버가 만들어져 list_my_servers에 함께 보입니다. 이 대화에서 토큰을 받은 적이 있다면 항상 전달하세요.",
    ),
};

const createMcpServerInputSchema = z.object(createMcpServerInputShape);
export type CreateMcpServerInput = z.infer<typeof createMcpServerInputSchema>;

export function createCreateMcpServerHandler(baseCtx: ToolContext) {
  return async (args: CreateMcpServerInput): Promise<ToolTextResult> => {
    if (!baseCtx.rateLimiters.mutate.tryConsume(baseCtx.rateLimitKey)) {
      return textResult(rateLimitExceededMarkdown("mutate"), { isError: true, ctx: baseCtx });
    }

    // owner_token argument (conversation-carried identity) wins over this
    // request's own auto-issued identity — see context.ts resolveOwnerIdentity.
    const ctx = await resolveOwnerIdentity(baseCtx, args.owner_token);

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
        "",
        "완성되면 **바로 연결해 쓸 수 있는 공개 URL**이 나와요. 다만 **완성 알림이 자동으로 오지는 않으니**, 사용자에게 \"약 **20~30초 뒤에** 다시 '완료됐어?'라고 물어봐 주세요\"라고 안내해 주세요.",
        `_(어시스턴트 지시: \"잠시 후 URL을 알려드리겠다\"처럼 예고하지 마세요 — 생성 완료는 push 알림이 없습니다. 사용자가 다시 물어볼 때 \`get_job_status\`(작업 ID \`${job.id}\`)를 호출해 공개 URL을 전달하세요. 지금 즉시 호출하면 아직 생성 중(building)일 수 있습니다.)_`,
      ].join("\n"),
      { ctx },
    );
  };
}
