import Link from "next/link";
import { CopyButton } from "../../../components/CopyButton";
import { DemoBadge } from "../../../components/DemoBadge";
import { Pipeline } from "../../../components/Pipeline";
import { ServerActions } from "../../../components/ServerActions";
import { TokenSessionBridge } from "../../../components/TokenSessionBridge";
import { loadJobsForServer } from "../../../lib/job-context";
import { loadOwnerContext } from "../../../lib/owner-context";
import { resolveOwnerToken } from "../../../lib/owner-token";
import { derivePipeline } from "../../../lib/pipeline";
import { formatTimestamp, toServerCardViewModel } from "../../../lib/view-models";

interface ServerDetailPageProps {
  params: Promise<{ serverId: string }>;
  searchParams: Promise<{ token?: string; demo?: string }>;
}

export default async function ServerDetailPage({ params, searchParams }: ServerDetailPageProps) {
  const { serverId } = await params;
  const query = await searchParams;
  const token = await resolveOwnerToken(query.token);
  const forceMock = query.demo === "1" || query.demo === "true";
  const demoSuffix = forceMock ? "&demo=1" : "";

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

  const context = await loadOwnerContext(token, { forceMock });
  const server = context.servers.find((candidate) => candidate.id === serverId) ?? null;

  const backHref = `/servers?token=${encodeURIComponent(token)}${demoSuffix}`;

  if (!server) {
    return (
      <main className="page">
        <TokenSessionBridge />
        <Link className="back-link" href={backHref}>
          ← 목록으로
        </Link>
        <div className="empty-state">
          <p>서버를 찾을 수 없습니다.</p>
        </div>
      </main>
    );
  }

  const relatedJobs = await loadJobsForServer(serverId, context.source);
  const view = toServerCardViewModel(server);

  return (
    <main className="page">
      <TokenSessionBridge />
      <Link className="back-link" href={backHref}>
        ← 목록으로
      </Link>
      <div className="page-header">
        <h1 className="page-title">{server.name}</h1>
        <p className="card-slug">{server.slug}</p>
        <div className="owner-token-row">
          <span className={`status-pill status-pill-${view.status}`}>{view.statusLabel}</span>
          <span>MCP 스펙 {server.mcpVersion}</span>
          {context.source === "mock" && <DemoBadge />}
        </div>
        {context.source !== "mock" && <ServerActions serverId={server.id} status={server.status} />}
      </div>

      <section className="detail-section">
        <h2 className="section-title">파이프라인</h2>
        <div className="pipeline-panel">
          <Pipeline
            states={derivePipeline(
              [...relatedJobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0] ?? null,
              [],
            )}
            size="md"
          />
        </div>
      </section>

      <section className="detail-section">
        <h2 className="section-title">공개 URL</h2>
        {server.publicUrl ? (
          <div className="public-url-row">
            <span className="public-url-text">{server.publicUrl}</span>
            <CopyButton value={server.publicUrl} />
          </div>
        ) : (
          <p className="page-subtitle">아직 배포되지 않았습니다.</p>
        )}
      </section>

      <section className="detail-section">
        <h2 className="section-title">연결 방법</h2>
        <p className="page-subtitle">
          위 공개 URL은 <strong>Remote MCP (Streamable HTTP)</strong> 엔드포인트입니다. Streamable HTTP를
          지원하는 MCP 클라이언트에 등록하면 바로 연결됩니다.
        </p>
        {server.publicUrl && (
          <ul className="tool-list">
            <li>
              <div className="tool-name">Claude Code (CLI)</div>
              <div className="public-url-row">
                <span className="public-url-text">
                  {`claude mcp add --transport http ${server.slug} ${server.publicUrl}`}
                </span>
                <CopyButton value={`claude mcp add --transport http ${server.slug} ${server.publicUrl}`} />
              </div>
            </li>
            <li>
              <div className="tool-name">Claude Desktop</div>
              <div className="page-subtitle">
                설정 → 커넥터 → <strong>커스텀 커넥터 추가</strong> → 위 공개 URL 붙여넣기
              </div>
            </li>
            <li>
              <div className="tool-name">ChatGPT</div>
              <div className="page-subtitle">
                설정 → 커넥터(개발자 모드) → <strong>추가</strong> → 위 공개 URL 붙여넣기 (커넥터 지원 플랜 필요)
              </div>
            </li>
            <li>
              <div className="tool-name">Cursor · MCP Inspector</div>
              <div className="page-subtitle">Remote MCP(Streamable HTTP) 주소 칸에 위 공개 URL 입력</div>
            </li>
          </ul>
        )}
      </section>

      <section className="detail-section">
        <h2 className="section-title">툴 목록 ({server.tools.length}개)</h2>
        {server.tools.length === 0 ? (
          <p className="page-subtitle">등록된 툴이 없습니다.</p>
        ) : (
          <ul className="tool-list">
            {server.tools.map((tool) => (
              <li key={tool.name}>
                <div className="tool-name">{tool.name}</div>
                <div className="page-subtitle">{tool.description}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {server.probeResult && (
        <section className="detail-section">
          <h2 className="section-title">지연 측정 결과</h2>
          <p className="page-subtitle">
            {server.probeResult.passed ? "통과" : "실패"} · 최대 {server.probeResult.maxLatencyMs}ms ·{" "}
            {server.probeResult.sampleCount}회 측정
          </p>
        </section>
      )}

      <section className="detail-section">
        <h2 className="section-title">작업 이력</h2>
        {relatedJobs.length === 0 ? (
          <p className="page-subtitle">기록된 작업이 없습니다.</p>
        ) : (
          <ul className="tool-list">
            {relatedJobs.map((job) => (
              <li key={job.id}>
                <Link href={`/jobs/${job.id}?token=${encodeURIComponent(token)}${demoSuffix}`}>
                  {job.type} · {job.stage} · {formatTimestamp(job.createdAt)} (UTC)
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
