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
    "**바로 연결해서 쓰는 법** — 아래 URL을 MCP 클라이언트에 **Remote MCP (Streamable HTTP)** 로 등록하면 됩니다.",
    "",
    "```",
    `claude mcp add --transport http ${server.slug} ${url}`,
    "```",
    "Claude Desktop · Cursor · MCP Inspector 등에서는 Remote MCP(Streamable HTTP) 주소 칸에 위 URL을 넣으세요.",
  ].join("\n");
}
