import Link from "next/link";
import type { FilterCount } from "../lib/view-models";
import type { ServerStatusFilter } from "../lib/status-labels";

/** Owner token now rides in a cookie (TokenSessionBridge), so tab links carry
 * only the filter — no token in the URL. */
export function StatusFilterTabs({
  counts,
  active,
}: {
  counts: FilterCount[];
  active: ServerStatusFilter;
}) {
  return (
    <nav className="filter-tabs" aria-label="서버 상태 필터">
      {counts.map(({ filter, label, count }) => {
        const isActive = filter === active;
        const href = filter === "all" ? "/servers" : `/servers?status=${filter}`;
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
