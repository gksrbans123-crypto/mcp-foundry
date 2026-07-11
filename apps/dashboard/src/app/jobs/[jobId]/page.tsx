import Link from "next/link";
import { DemoBadge } from "../../../components/DemoBadge";
import { JobTimeline } from "../../../components/JobTimeline";
import { TokenSessionBridge } from "../../../components/TokenSessionBridge";
import { Pipeline } from "../../../components/Pipeline";
import { loadJobContext } from "../../../lib/job-context";
import { derivePipeline } from "../../../lib/pipeline";
import { resolveOwnerToken } from "../../../lib/owner-token";
import { jobStageLabel, jobStagePillClass } from "../../../lib/status-labels";
import { formatTimestamp } from "../../../lib/view-models";

interface JobDetailPageProps {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ token?: string; demo?: string }>;
}

export default async function JobDetailPage({ params, searchParams }: JobDetailPageProps) {
  const { jobId } = await params;
  const query = await searchParams;
  const token = await resolveOwnerToken(query.token);
  const forceMock = query.demo === "1" || query.demo === "true";
  const demoSuffix = forceMock ? "&demo=1" : "";
  const backHref = `/servers?token=${encodeURIComponent(token)}${demoSuffix}`;

  if (!token) {
    return (
      <main className="page">
        <TokenSessionBridge />
        <div className="empty-state">
          <p>
            owner token이 필요합니다. URL에 <code>?token=...</code>을 포함해 접속해주세요.
          </p>
        </div>
      </main>
    );
  }

  const context = await loadJobContext(jobId, token, { forceMock });

  if (!context.job) {
    return (
      <main className="page">
        <TokenSessionBridge />
        <Link className="back-link" href={backHref}>
          ← 목록으로
        </Link>
        {/* 존재하지 않는 작업과 다른 소유자의 작업을 같은 문구로 안내해 ID 추측 공격에 정보를 노출하지 않는다. */}
        <div className="empty-state">
          <p>작업을 찾을 수 없습니다.</p>
        </div>
      </main>
    );
  }

  const { job, statusEvents, server } = context;

  return (
    <main className="page">
      <TokenSessionBridge />
      <Link className="back-link" href={backHref}>
        ← 목록으로
      </Link>
      <div className="page-header">
        <h1 className="page-title">작업 {job.id}</h1>
        <p className="page-subtitle">{job.input.nl}</p>
        <div className="owner-token-row">
          <span className={`status-pill status-pill-${jobStagePillClass(job.stage)}`}>
            {jobStageLabel(job.stage)}
          </span>
          <span>시도 {job.attempts}회</span>
          {context.source === "mock" && <DemoBadge />}
        </div>
      </div>

      <section className="detail-section">
        <h2 className="section-title">파이프라인</h2>
        <div className="pipeline-panel">
          <Pipeline states={derivePipeline(job, statusEvents)} size="md" />
        </div>
      </section>

      {server && (
        <section className="detail-section">
          <h2 className="section-title">관련 서버</h2>
          <p className="page-subtitle">
            <Link href={`/servers/${server.id}?token=${encodeURIComponent(token)}${demoSuffix}`}>
              {server.name} ({server.slug})
            </Link>
          </p>
        </section>
      )}

      {job.error && (
        <section className="detail-section">
          <h2 className="section-title">에러</h2>
          <div className="error-box">{job.error}</div>
        </section>
      )}

      {server?.probeResult && (
        <section className="detail-section">
          <h2 className="section-title">지연 측정 결과</h2>
          <p className="page-subtitle">
            {server.probeResult.passed ? "통과" : "실패"} · 최대 {server.probeResult.maxLatencyMs}ms ·{" "}
            {server.probeResult.sampleCount}회 측정
          </p>
        </section>
      )}

      <section className="detail-section">
        <h2 className="section-title">단계 타임라인</h2>
        <JobTimeline events={statusEvents} />
      </section>

      <section className="detail-section">
        <h2 className="section-title">생성 시각</h2>
        <p className="page-subtitle">{formatTimestamp(job.createdAt)} (UTC)</p>
      </section>
    </main>
  );
}
