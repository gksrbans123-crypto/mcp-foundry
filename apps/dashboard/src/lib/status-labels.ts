import type { JobStage, ServerStatus } from "@mcp-foundry/shared";

/**
 * PlayMCP "My MCP Servers" 화면의 필터 탭 순서와 동일하게 유지한다. "all"은
 * ServerStatus에 없는 대시보드 전용 필터 값이라 별도 유니언으로 둔다.
 */
export const SERVER_STATUS_FILTERS = ["all", "active", "disabled", "building", "failed", "deleted"] as const;
export type ServerStatusFilter = (typeof SERVER_STATUS_FILTERS)[number];

const SERVER_STATUS_LABELS: Record<ServerStatusFilter, string> = {
  all: "전체",
  active: "활성",
  disabled: "비활성",
  building: "진행중",
  failed: "실패",
  deleted: "삭제",
};

export function serverStatusFilterLabel(filter: ServerStatusFilter): string {
  return SERVER_STATUS_LABELS[filter];
}

export function matchesServerStatusFilter(status: ServerStatus, filter: ServerStatusFilter): boolean {
  return filter === "all" || status === filter;
}

const JOB_STAGE_LABELS: Record<JobStage, string> = {
  queued: "대기중",
  generating: "생성 중",
  building: "빌드 중",
  validating: "검증 중",
  probing: "지연 측정 중",
  deploying: "배포 중",
  active: "활성",
  failed: "실패",
};

/** Falls back to the raw value for any step name apps/worker emits that isn't a job stage. */
export function jobStageLabel(value: string): string {
  return (JOB_STAGE_LABELS as Record<string, string>)[value] ?? value;
}

/** Reuses the server status-pill palette: any in-flight stage reads as "building". */
export function jobStagePillClass(stage: JobStage): "active" | "building" | "failed" {
  if (stage === "active") return "active";
  if (stage === "failed") return "failed";
  return "building";
}
