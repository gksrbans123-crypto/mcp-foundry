import Link from "next/link";
import { AutoRefresh } from "../../components/AutoRefresh";
import { DemoBadge } from "../../components/DemoBadge";
import { ServerCard } from "../../components/ServerCard";
import { StatusFilterTabs } from "../../components/StatusFilterTabs";
import { TokenSessionBridge } from "../../components/TokenSessionBridge";
import { loadOwnerContext } from "../../lib/owner-context";
import { resolveOwnerToken } from "../../lib/owner-token";
import { SERVER_STATUS_FILTERS, type ServerStatusFilter } from "../../lib/status-labels";
import { maskOwnerToken } from "../../lib/token";
import { buildFilterCounts, filterServers } from "../../lib/view-models";

function parseStatusFilter(value: string | undefined): ServerStatusFilter {
  return (SERVER_STATUS_FILTERS as readonly string[]).includes(value ?? "")
    ? (value as ServerStatusFilter)
    : "all";
}

interface ServersPageProps {
  searchParams: Promise<{ token?: string; status?: string; demo?: string }>;
}

export default async function ServersPage({ searchParams }: ServersPageProps) {
  const params = await searchParams;
  const token = await resolveOwnerToken(params.token);
  const filter = parseStatusFilter(params.status);
  const forceMock = params.demo === "1" || params.demo === "true";

  if (!token) {
    return (
      <main className="page">
        <TokenSessionBridge />
        <div className="page-header">
          <h1 className="page-title">나의 MCP 서버</h1>
          <p className="page-subtitle">등록한 MCP 서버를 상태별로 확인하고 관리하세요.</p>
        </div>
        <div className="empty-state">
          <p>
            owner token이 필요합니다. URL에 <code>?token=...</code>을 포함해 접속해주세요.
          </p>
          <p className="empty-state-actions">
            <Link className="button button-primary" href="/servers?token=demo&demo=1">
              데모 보기
            </Link>
          </p>
        </div>
      </main>
    );
  }

  const context = await loadOwnerContext(token, { forceMock });
  const counts = buildFilterCounts([...context.servers, ...context.failedCreates, ...context.buildingCreates]);
  const visibleServers = filterServers(context.servers, filter);
  // Both orphan-job card kinds link to /jobs/{jobId} — no server row exists (yet).
  const visibleJobCards = filterServers([...context.buildingCreates, ...context.failedCreates], filter);

  return (
    <main className="page">
      <TokenSessionBridge />
      <div className="page-header">
        <h1 className="page-title">나의 MCP 서버</h1>
        <p className="page-subtitle">등록한 MCP 서버를 상태별로 확인하고 관리하세요.</p>
        <div className="owner-token-row">
          <span>인증 토큰</span>
          <span className="owner-token-value">{maskOwnerToken(token)}</span>
          {context.source === "mock" && <DemoBadge />}
          {context.source !== "mock" && (
            <AutoRefresh
              active={
                context.buildingCreates.length > 0 ||
                context.servers.some((server) => server.status === "building")
              }
            />
          )}
        </div>
      </div>

      <StatusFilterTabs counts={counts} active={filter} demo={forceMock} />

      {context.notFound && (
        <div className="empty-state">
          <p>이 토큰으로 등록된 서버를 찾을 수 없습니다. 토큰을 다시 확인해주세요.</p>
        </div>
      )}

      {!context.notFound && visibleServers.length === 0 && visibleJobCards.length === 0 && (
        <div className="empty-state">
          <p>해당 필터에 표시할 서버가 없습니다.</p>
        </div>
      )}

      {(visibleServers.length > 0 || visibleJobCards.length > 0) && (
        <div className="card-grid">
          {visibleServers.map((server) => (
            <ServerCard key={server.id} server={server} states={context.pipelines[server.id] ?? []} demo={forceMock} />
          ))}
          {visibleJobCards.map((entry) => (
            <ServerCard
              key={entry.id}
              server={entry}
              states={context.pipelines[entry.id] ?? []}
              demo={forceMock}
              href={`/jobs/${entry.id}`}
            />
          ))}
        </div>
      )}
    </main>
  );
}
