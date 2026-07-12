import type { Job } from "@mcp-foundry/shared";
import { describe, expect, it } from "vitest";
import { isOrphanFailedCreate, toFailedCreatePseudoServer } from "./failed-creates";

function buildJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-abc12345-6789",
    userId: "user-1",
    serverId: null,
    type: "create",
    input: { nl: "주요 도시의 날씨 정보를 제공하는 MCP 서버를 생성합니다." },
    parsedSpec: null,
    stage: "failed",
    status: "failed",
    error: "unhandled worker error: duplicate key value violates unique constraint",
    attempts: 3,
    lockedAt: null,
    lockedBy: null,
    idempotencyKey: null,
    createdAt: "2026-07-13T01:00:00.000Z",
    updatedAt: "2026-07-13T01:01:00.000Z",
    ...overrides,
  };
}

describe("isOrphanFailedCreate", () => {
  it("matches a terminally failed create job that has no server row", () => {
    expect(isOrphanFailedCreate(buildJob())).toBe(true);
  });

  it("excludes failed creates that DO have a server row (surfaced via the real server card)", () => {
    expect(isOrphanFailedCreate(buildJob({ serverId: "server-1" }))).toBe(false);
  });

  it("excludes non-create jobs and non-failed stages", () => {
    expect(isOrphanFailedCreate(buildJob({ type: "refine" }))).toBe(false);
    expect(isOrphanFailedCreate(buildJob({ stage: "building", status: "building" }))).toBe(false);
  });
});

describe("toFailedCreatePseudoServer", () => {
  it("shapes the job as a failed Server entry keyed by the job id", () => {
    const entry = toFailedCreatePseudoServer(buildJob());

    expect(entry.id).toBe("job-abc12345-6789");
    expect(entry.status).toBe("failed");
    expect(entry.publicUrl).toBeNull();
    expect(entry.tools).toEqual([]);
    expect(entry.slug).toBe("요청 job-abc1");
  });

  it("prefers the structured name hint and truncates long NL requests", () => {
    const named = toFailedCreatePseudoServer(buildJob({ input: { nl: "무시됨", name: "날씨 서버" } }));
    expect(named.name).toBe("날씨 서버");

    const long = toFailedCreatePseudoServer(buildJob({ input: { nl: "가".repeat(60) } }));
    expect(long.name).toBe(`${"가".repeat(40)}…`);
  });

  it("falls back to a placeholder name for a blank request", () => {
    expect(toFailedCreatePseudoServer(buildJob({ input: { nl: "   " } })).name).toBe("생성 실패한 요청");
  });
});
