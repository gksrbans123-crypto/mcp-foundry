import type { Server } from "@mcp-foundry/shared";

/** Human-friendly Korean labels for pipeline stages, shown in tool responses. */
const STAGE_KO: Record<string, string> = {
  queued: "대기 중",
  generating: "스펙 생성 중",
  building: "빌드 중",
  validating: "MCP 표준 검증 중 (Inspector)",
  probing: "응답속도 측정 중",
  deploying: "배포 중",
  active: "완료",
  failed: "실패",
};

export function stageLabelKo(stage: string): string {
  return STAGE_KO[stage] ?? stage;
}

/** "How to connect" block shown once a generated server is live — the public
 * URL is a real Remote MCP (Streamable HTTP) endpoint anyone can register. */
export function connectionGuideKo(server: Server): string {
  const url = server.publicUrl ?? "";
  return [
    "**바로 연결해서 쓰는 법** — 위 공개 URL은 **Remote MCP (Streamable HTTP)** 엔드포인트예요.",
    "",
    "**Claude Code (CLI):**",
    "```",
    `claude mcp add --transport http ${server.slug} ${url}`,
    "```",
    "- **Claude Desktop:** 설정 → 커넥터 → 커스텀 커넥터 추가 → 위 URL 붙여넣기",
    "- **ChatGPT:** 설정 → 커넥터(개발자 모드) → 추가 → 위 URL 붙여넣기 (커넥터 지원 플랜 필요)",
    "- **Cursor · MCP Inspector:** Remote MCP(Streamable HTTP) 주소 칸에 위 URL 입력",
  ].join("\n");
}
