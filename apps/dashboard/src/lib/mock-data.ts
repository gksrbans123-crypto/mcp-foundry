import type { Job, Server, StatusEvent, User } from "@mcp-foundry/shared";
import { derivePipeline, type StageState } from "./pipeline";

/**
 * Deterministic demo fixtures (plan §2(c)/§10 P2: "대시보드 목록·필터" must
 * render without a live DB). Timestamps are fixed ISO strings rather than
 * `new Date()` so mock-driven tests and snapshots never depend on wall-clock
 * time. One server per ServerStatus so every filter tab has at least one
 * card to show.
 */
export const MOCK_USER: User = {
  id: "user_demo",
  authRef: "demo-auth-ref",
  createdAt: "2026-06-01T09:00:00.000Z",
};

export const MOCK_SERVERS: Server[] = [
  {
    id: "server_demo_active",
    userId: MOCK_USER.id,
    name: "날씨 알리미",
    slug: "weather-buddy",
    publicUrl: "https://mcp-foundry.example.com/s/weather-buddy/mcp",
    mcpVersion: "2025-06-18",
    status: "active",
    tools: [
      { name: "get_current_weather", description: "도시명으로 현재 날씨를 조회합니다." },
      { name: "get_forecast", description: "5일간의 일기예보를 조회합니다." },
    ],
    probeResult: { passed: true, measuredAtMs: 812, maxLatencyMs: 1180, sampleCount: 20 },
    deployRef: "runtime-host:weather-buddy",
    createdAt: "2026-06-02T01:00:00.000Z",
    updatedAt: "2026-06-02T01:05:00.000Z",
  },
  {
    id: "server_demo_building",
    userId: MOCK_USER.id,
    name: "뉴스 브리핑",
    slug: "news-brief",
    publicUrl: null,
    mcpVersion: "2025-06-18",
    status: "building",
    tools: [{ name: "get_top_headlines", description: "주제별 주요 뉴스 헤드라인을 조회합니다." }],
    probeResult: null,
    deployRef: null,
    createdAt: "2026-06-03T04:20:00.000Z",
    updatedAt: "2026-06-03T04:22:00.000Z",
  },
  {
    id: "server_demo_failed",
    userId: MOCK_USER.id,
    name: "환율 계산기",
    slug: "fx-calc",
    publicUrl: null,
    mcpVersion: "2025-06-18",
    status: "failed",
    tools: [{ name: "convert_currency", description: "두 통화 간 환율을 변환합니다." }],
    probeResult: { passed: false, measuredAtMs: 3400, maxLatencyMs: 2500, sampleCount: 20 },
    deployRef: null,
    createdAt: "2026-06-01T11:00:00.000Z",
    updatedAt: "2026-06-01T11:10:00.000Z",
  },
  {
    id: "server_demo_deleted",
    userId: MOCK_USER.id,
    name: "옛날 메모 서버",
    slug: "old-memo",
    publicUrl: null,
    mcpVersion: "2025-03-26",
    status: "deleted",
    tools: [{ name: "save_memo", description: "짧은 메모를 저장합니다." }],
    probeResult: { passed: true, measuredAtMs: 640, maxLatencyMs: 1180, sampleCount: 20 },
    deployRef: null,
    createdAt: "2026-05-20T08:00:00.000Z",
    updatedAt: "2026-05-25T02:00:00.000Z",
  },
  {
    id: "server_demo_disabled",
    userId: MOCK_USER.id,
    name: "지하철 도착 알리미",
    slug: "subway-arrival",
    publicUrl: "https://demo.example/s/subway-arrival/mcp",
    mcpVersion: "2025-06-18",
    status: "disabled",
    tools: [{ name: "get_arrival", description: "역명으로 지하철 도착 정보를 조회합니다." }],
    probeResult: { passed: true, measuredAtMs: 720, maxLatencyMs: 1320, sampleCount: 20 },
    deployRef: "demo-ref-subway",
    createdAt: "2026-05-28T09:00:00.000Z",
    updatedAt: "2026-06-03T04:30:00.000Z",
  },
];

/** One job per server, IDs deterministic so /jobs/{jobId} demo links are stable. */
export const MOCK_JOBS: Job[] = [
  {
    id: "job_demo_active",
    userId: MOCK_USER.id,
    serverId: "server_demo_active",
    type: "create",
    input: { nl: "서울 날씨를 알려주는 MCP 서버를 만들어줘" },
    parsedSpec: null,
    stage: "active",
    status: "active",
    error: null,
    attempts: 1,
    lockedAt: null,
    lockedBy: null,
    idempotencyKey: "demo-hash-active",
    createdAt: "2026-06-02T00:58:00.000Z",
    updatedAt: "2026-06-02T01:05:00.000Z",
  },
  {
    id: "job_demo_building",
    userId: MOCK_USER.id,
    serverId: "server_demo_building",
    type: "create",
    input: { nl: "카테고리별 뉴스 헤드라인을 알려주는 서버 만들어줘" },
    parsedSpec: null,
    stage: "building",
    status: "building",
    error: null,
    attempts: 1,
    lockedAt: "2026-06-03T04:22:00.000Z",
    lockedBy: "worker-demo-1",
    idempotencyKey: null,
    createdAt: "2026-06-03T04:20:00.000Z",
    updatedAt: "2026-06-03T04:22:00.000Z",
  },
  {
    id: "job_demo_failed",
    userId: MOCK_USER.id,
    serverId: "server_demo_failed",
    type: "create",
    input: { nl: "USD/KRW 환율을 계산해주는 서버 만들어줘" },
    parsedSpec: null,
    stage: "failed",
    status: "failed",
    error: "지연 측정 실패: 업스트림 응답이 2500ms 게이트를 3회 연속 초과했습니다.",
    attempts: 3,
    lockedAt: null,
    lockedBy: null,
    idempotencyKey: "demo-hash-failed",
    createdAt: "2026-06-01T10:55:00.000Z",
    updatedAt: "2026-06-01T11:10:00.000Z",
  },
  {
    id: "job_demo_deleted",
    userId: MOCK_USER.id,
    serverId: "server_demo_deleted",
    type: "delete",
    input: { nl: "옛날 메모 서버 삭제해줘" },
    parsedSpec: null,
    stage: "active",
    status: "active",
    error: null,
    attempts: 1,
    lockedAt: null,
    lockedBy: null,
    idempotencyKey: null,
    createdAt: "2026-05-25T01:58:00.000Z",
    updatedAt: "2026-05-25T02:00:00.000Z",
  },
  {
    id: "job_demo_disabled",
    userId: MOCK_USER.id,
    serverId: "server_demo_disabled",
    type: "create",
    input: { nl: "지하철 도착 정보 알려주는 서버 만들어줘" },
    parsedSpec: null,
    stage: "active",
    status: "active",
    error: null,
    attempts: 1,
    lockedAt: null,
    lockedBy: null,
    idempotencyKey: "demo-hash-subway",
    createdAt: "2026-05-28T09:00:00.000Z",
    updatedAt: "2026-05-28T09:05:00.000Z",
  },
];

export const MOCK_STATUS_EVENTS: Record<string, StatusEvent[]> = {
  job_demo_active: [
    { id: "evt_active_1", jobId: "job_demo_active", step: "queued", status: "queued", message: null, at: "2026-06-02T00:58:00.000Z" },
    { id: "evt_active_2", jobId: "job_demo_active", step: "generating", status: "generating", message: "템플릿 매칭: weather", at: "2026-06-02T00:58:30.000Z" },
    { id: "evt_active_3", jobId: "job_demo_active", step: "building", status: "building", message: null, at: "2026-06-02T00:59:00.000Z" },
    { id: "evt_active_4", jobId: "job_demo_active", step: "validating", status: "validating", message: "정적검사 통과, Inspector 점검 통과", at: "2026-06-02T01:00:00.000Z" },
    { id: "evt_active_5", jobId: "job_demo_active", step: "probing", status: "probing", message: "관측 max 1180ms (< 2000ms)", at: "2026-06-02T01:03:00.000Z" },
    { id: "evt_active_6", jobId: "job_demo_active", step: "deploying", status: "deploying", message: null, at: "2026-06-02T01:04:00.000Z" },
    { id: "evt_active_7", jobId: "job_demo_active", step: "active", status: "active", message: "공개 URL 발급 완료", at: "2026-06-02T01:05:00.000Z" },
  ],
  job_demo_building: [
    { id: "evt_building_1", jobId: "job_demo_building", step: "queued", status: "queued", message: null, at: "2026-06-03T04:20:00.000Z" },
    { id: "evt_building_2", jobId: "job_demo_building", step: "generating", status: "generating", message: "HTTP-wrapper 폴백 사용", at: "2026-06-03T04:21:00.000Z" },
    { id: "evt_building_3", jobId: "job_demo_building", step: "building", status: "building", message: null, at: "2026-06-03T04:22:00.000Z" },
  ],
  job_demo_failed: [
    { id: "evt_failed_1", jobId: "job_demo_failed", step: "queued", status: "queued", message: null, at: "2026-06-01T10:55:00.000Z" },
    { id: "evt_failed_2", jobId: "job_demo_failed", step: "generating", status: "generating", message: null, at: "2026-06-01T10:56:00.000Z" },
    { id: "evt_failed_3", jobId: "job_demo_failed", step: "building", status: "building", message: null, at: "2026-06-01T10:57:00.000Z" },
    { id: "evt_failed_4", jobId: "job_demo_failed", step: "validating", status: "validating", message: null, at: "2026-06-01T10:58:00.000Z" },
    { id: "evt_failed_5", jobId: "job_demo_failed", step: "probing", status: "failed", message: "3회 재시도 후에도 게이트 초과 — 비준수 실패로 판정", at: "2026-06-01T11:10:00.000Z" },
  ],
  job_demo_deleted: [
    { id: "evt_deleted_1", jobId: "job_demo_deleted", step: "queued", status: "queued", message: null, at: "2026-05-25T01:58:00.000Z" },
    { id: "evt_deleted_2", jobId: "job_demo_deleted", step: "active", status: "active", message: "서버 삭제(soft delete) 완료", at: "2026-05-25T02:00:00.000Z" },
  ],
};

export interface OwnerContext {
  source: "db" | "mock";
  user: User | null;
  servers: Server[];
  /** DB reachable but no user matches the given token — a real empty state, distinct from mock fallback. */
  notFound: boolean;
  /** serverId -> pipeline stage states for that server's latest job. */
  pipelines: Record<string, StageState[]>;
}

export function buildMockOwnerContext(): OwnerContext {
  const pipelines: Record<string, StageState[]> = {};
  for (const server of MOCK_SERVERS) {
    const job =
      MOCK_JOBS.filter((j) => j.serverId === server.id).sort((a, b) =>
        a.createdAt < b.createdAt ? 1 : -1,
      )[0] ?? null;
    pipelines[server.id] = derivePipeline(job, job ? findMockStatusEvents(job.id) : []);
  }
  return { source: "mock", user: MOCK_USER, servers: MOCK_SERVERS, notFound: false, pipelines };
}

export function findMockJob(jobId: string): Job | null {
  return MOCK_JOBS.find((job) => job.id === jobId) ?? null;
}

export function findMockStatusEvents(jobId: string): StatusEvent[] {
  return MOCK_STATUS_EVENTS[jobId] ?? [];
}

export function findMockServer(serverId: string): Server | null {
  return MOCK_SERVERS.find((server) => server.id === serverId) ?? null;
}
