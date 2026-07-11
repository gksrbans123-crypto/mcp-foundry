import type { FetchGuard } from "@mcp-foundry/spec";
import { EgressBlockedError } from "./errors.js";
import { defaultResolveHost, type ResolveHost } from "./resolve-host.js";
import { defaultSendPinnedRequest, type SendPinnedRequest } from "./send-pinned-request.js";

export interface GuardedFetchOptions {
  /** Hostnames this spec's own urlTemplates declare — computed once from
   * trusted spec content, never from caller-supplied arguments. */
  allowedHosts: ReadonlySet<string>;
  /** Optional process-wide allowlist (EGRESS_ALLOWLIST env var). */
  globalAllowlist?: readonly string[];
  resolveHost?: ResolveHost;
  sendRequest?: SendPinnedRequest;
}

/**
 * Builds the FetchGuard injected into packages/spec's interpreter for
 * apps/worker's probe runner and compliance-check harness (plan §5.2 TCB
 * hardening: egress allowlist + SSRF + DNS-rebinding defense) — the exact
 * same hardening a live-served tool call gets, applied before a spec is
 * ever exposed publicly.
 *
 * Ported from apps/runtime-host/src/egress/guarded-fetch.ts — see the
 * duplication note in ip-range-check.ts.
 */
export function createGuardedFetch(options: GuardedFetchOptions): FetchGuard {
  const resolveHost = options.resolveHost ?? defaultResolveHost;
  const sendRequest = options.sendRequest ?? defaultSendPinnedRequest;
  const globalAllowlist = options.globalAllowlist?.map((host) => host.toLowerCase()) ?? [];

  return async (url, request) => {
    const hostname = url.hostname.toLowerCase();

    if (!options.allowedHosts.has(hostname)) {
      throw new EgressBlockedError(`host "${hostname}" is not declared by this server's spec`);
    }
    if (globalAllowlist.length > 0 && !globalAllowlist.includes(hostname)) {
      throw new EgressBlockedError(`host "${hostname}" is not in the process-wide egress allowlist`);
    }

    const addresses = await resolveHost(hostname);
    const pinnedIp = addresses[0];
    if (pinnedIp === undefined) {
      throw new EgressBlockedError(`could not resolve host "${hostname}"`);
    }
    return sendRequest(url, pinnedIp, request);
  };
}
