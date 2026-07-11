import type { OpenApiFetcher } from "@mcp-foundry/generator";
import { readBodyWithLimit, safeJsonParse } from "@mcp-foundry/spec";
import { EgressBlockedError } from "./errors.js";
import { defaultResolveHost, type ResolveHost } from "./resolve-host.js";
import { defaultSendPinnedRequest, type SendPinnedRequest } from "./send-pinned-request.js";

export interface GuardedOpenApiFetchOptions {
  /** Process-wide egress allowlist (EGRESS_ALLOWLIST env). Empty/unset means
   * no additional host restriction beyond the SSRF/private-IP checks below —
   * same convention as guarded-fetch.ts, since (unlike a deployed spec's own
   * declared hosts) there is no fixed host list to restrict openapi_url to;
   * arbitrary external OpenAPI URLs are the point of this feature. */
  globalAllowlist?: readonly string[];
  timeoutMs?: number;
  maxResponseBytes?: number;
  resolveHost?: ResolveHost;
  sendRequest?: SendPinnedRequest;
}

const DEFAULT_TIMEOUT_MS = 5_000;
// OpenAPI documents run larger than a typical tool-call response (some
// real-world specs are multi-hundred-KB), so this is well above packages/
// spec's 256KB per-tool-call cap — still a firm bound against a
// malicious/misbehaving endpoint streaming an unbounded body.
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Security review HIGH-1/MEDIUM-5: `packages/generator`'s
 * `defaultOpenApiFetcher` (openapi/types.ts) is a raw `fetch(url)` — the one
 * place a user-supplied URL (create_mcp_server's `openapi_url`) was fetched
 * with none of the SSRF/DNS-rebinding/timeout/size hardening every other
 * egress path in this system has. This fetcher reuses the same resolve ->
 * validate -> pin building blocks as guarded-fetch.ts, but for an arbitrary
 * caller-supplied URL rather than a spec's own fixed set of declared hosts:
 * https-only, DNS-resolved and validated (every address, not just the
 * first), the validated IP pinned for the actual connection (closing the
 * DNS-rebinding TOCTOU window), a hard request timeout, and a capped,
 * incrementally-enforced response size. Node's `http`/`https` modules
 * (via sendPinnedRequest) never auto-follow redirects the way `fetch`
 * does, so a 3xx response is surfaced as a failure rather than silently
 * chased to a second, unvalidated URL.
 */
export function createGuardedOpenApiFetcher(options: GuardedOpenApiFetchOptions = {}): OpenApiFetcher {
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const sendRequest = options.sendRequest ?? defaultSendPinnedRequest;
  const globalAllowlist = options.globalAllowlist?.map((host) => host.toLowerCase()) ?? [];
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  return async (rawUrl: string): Promise<unknown> => {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new EgressBlockedError(`"${rawUrl}" is not a valid URL`);
    }
    if (url.protocol !== "https:") {
      throw new EgressBlockedError(`openapi_url must use https, got "${url.protocol}"`);
    }

    const hostname = url.hostname.toLowerCase();
    if (globalAllowlist.length > 0 && !globalAllowlist.includes(hostname)) {
      throw new EgressBlockedError(`host "${hostname}" is not in the process-wide egress allowlist`);
    }

    const addresses = await resolveHost(hostname);
    const pinnedIp = addresses[0];
    if (pinnedIp === undefined) {
      throw new EgressBlockedError(`could not resolve host "${hostname}"`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await sendRequest(url, pinnedIp, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`failed to fetch OpenAPI document from ${rawUrl}: ${response.status} ${response.statusText}`);
      }

      const text = await readBodyWithLimit(response, maxResponseBytes);
      const parsed = safeJsonParse(text);
      if (parsed === undefined) {
        throw new Error(`OpenAPI document at ${rawUrl} was not valid JSON`);
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  };
}
