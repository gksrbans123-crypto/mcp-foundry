"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { buildUrlWithoutToken } from "../lib/token-url";
import { OWNER_TOKEN_COOKIE } from "../lib/owner-token-cookie";

/**
 * Captures the owner token from `?token=` into a cookie so server components
 * can read it on later navigations/reloads (see lib/owner-token.ts), then
 * scrubs it from the visible URL (MEDIUM-3).
 *
 * Deliberately does NOT re-add the token to the URL: the previous version
 * scrubbed via `history.replaceState` and re-added via `router.replace`, and
 * because Next syncs `replaceState` back into `useSearchParams`, those two
 * fought each other in an infinite loop — re-rendering (flashing) the card
 * grid and hijacking clicks on "상세보기". The cookie removes the need to keep
 * the token in the URL at all, so this effect just runs once per real
 * `?token=` hop and then stays quiet.
 */
export function TokenSessionBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tokenInUrl = searchParams.get("token");
    if (!tokenInUrl) return;
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    // Session cookie (no Max-Age) — same lifetime as the old sessionStorage.
    document.cookie = `${OWNER_TOKEN_COOKIE}=${encodeURIComponent(tokenInUrl)}; Path=/; SameSite=Lax${secure}`;
    window.history.replaceState(null, "", buildUrlWithoutToken(pathname, searchParams.toString()));
  }, [pathname, searchParams]);

  return null;
}
