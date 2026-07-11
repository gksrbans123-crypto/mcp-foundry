import { lookup as dnsLookup } from "node:dns/promises";
import { EgressBlockedError } from "./errors.js";
import { isDisallowedAddress } from "./ip-range-check.js";

export type ResolveHost = (hostname: string) => Promise<string[]>;

/**
 * Resolves `hostname` to every address the system resolver returns and
 * rejects if any of them (not just the first) is disallowed. This runs
 * once per request; the resulting address list is then pinned for the
 * actual connection (see send-pinned-request.ts) instead of letting the
 * HTTP client re-resolve DNS itself — closing the DNS-rebinding TOCTOU
 * window between this check and the connection (plan §5.2).
 *
 * Ported from apps/runtime-host/src/egress/resolve-host.ts — see the
 * duplication note in ip-range-check.ts.
 */
export const defaultResolveHost: ResolveHost = async (hostname) => {
  const results = await dnsLookup(hostname, { all: true, verbatim: true }).catch(() => []);
  if (results.length === 0) {
    throw new EgressBlockedError(`could not resolve host "${hostname}"`);
  }
  for (const { address } of results) {
    if (isDisallowedAddress(address)) {
      throw new EgressBlockedError(`host "${hostname}" resolved to a disallowed address`);
    }
  }
  return results.map((result) => result.address);
};
