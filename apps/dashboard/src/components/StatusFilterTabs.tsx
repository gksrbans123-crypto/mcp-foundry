import Link from "next/link";
import type { FilterCount } from "../lib/view-models";
import type { ServerStatusFilter } from "../lib/status-labels";

/** Owner token now rides in a cookie (TokenSessionBridge), so tab links carry
 * only the filter — no token in the URL. In demo mode the `demo=1` flag MUST
 * be carried across tab clicks too, otherwise the next hop drops out of mock
 * mode and tries to load real data for the placeholder "demo" token (cookie),
 * which 404s ("이 토큰으로 등록된 서버를 찾을 수 없습니다"). */
export function StatusFilterTabs({
  counts,
  active,
  demo = false,
}: {
  counts: FilterCount[];
  active: ServerStatusFilter;
  demo?: boolean;
}) {
  return (
    <nav className="filter-tabs" aria-label="서버 상태 필터">
      {counts.map(({ filter, label, count }) => {
        const isActive = filter === active;
        const params = new URLSearchParams();
        if (filter !== "all") params.set("status", filter);
        if (demo) params.set("demo", "1");
        const query = params.toString();
        const href = query ? `/servers?${query}` : "/servers";
        return (
          <Link key={filter} href={href} className={`filter-tab${isActive ? " filter-tab-active" : ""}`}>
            <span>{label}</span>
            <span className="filter-tab-count">{count}</span>
          </Link>
        );
      })}
    </nav>
  );
}
