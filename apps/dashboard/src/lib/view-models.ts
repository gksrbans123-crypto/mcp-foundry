import type { Server } from "@mcp-foundry/shared";
import {
  matchesServerStatusFilter,
  serverStatusFilterLabel,
  SERVER_STATUS_FILTERS,
  type ServerStatusFilter,
} from "./status-labels";

/**
 * Formats an ISO timestamp as UTC "YYYY-MM-DD HH:mm" without going through
 * `Intl`/`toLocaleString` — those read the host's locale/timezone, which
 * would make the same server render a different string on different
 * machines (and make the snapshot test in view-models.test.ts flaky).
 */
export function formatTimestamp(iso: string): string {
  return iso.replace("T", " ").slice(0, 16);
}

export interface ServerCardViewModel {
  id: string;
  name: string;
  slug: string;
  status: Server["status"];
  statusLabel: string;
  publicUrl: string | null;
  toolCount: number;
  probeSummary: string | null;
  updatedAtLabel: string;
}

export function toServerCardViewModel(server: Server): ServerCardViewModel {
  return {
    id: server.id,
    name: server.name,
    slug: server.slug,
    status: server.status,
    statusLabel: serverStatusFilterLabel(server.status),
    publicUrl: server.publicUrl,
    toolCount: server.tools.length,
    probeSummary: server.probeResult
      ? `${server.probeResult.passed ? "통과" : "실패"} (최대 ${server.probeResult.maxLatencyMs}ms, ${server.probeResult.sampleCount}회 측정)`
      : null,
    updatedAtLabel: formatTimestamp(server.updatedAt),
  };
}

export function filterServers(servers: Server[], filter: ServerStatusFilter): Server[] {
  return servers.filter((server) => matchesServerStatusFilter(server.status, filter));
}

export interface FilterCount {
  filter: ServerStatusFilter;
  label: string;
  count: number;
}

export function buildFilterCounts(servers: Server[]): FilterCount[] {
  return SERVER_STATUS_FILTERS.map((filter) => ({
    filter,
    label: serverStatusFilterLabel(filter),
    count: filterServers(servers, filter).length,
  }));
}
