"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the current server components on an interval (via router.refresh,
 * so no full page reload / scroll jump) while there's in-progress work, then
 * stops automatically once everything is settled. Placed on the servers list
 * and job detail pages so a build's pipeline updates live without a manual
 * refresh. Default 5s — short enough to actually show each pipeline stage on a
 * ~20-30s build.
 */
export function AutoRefresh({ active, intervalMs = 5000 }: { active: boolean; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  if (!active) return null;
  return (
    <span className="auto-refresh" aria-live="polite">
      <span className="auto-refresh-dot" />
      진행 중 · 자동 새로고침
    </span>
  );
}
