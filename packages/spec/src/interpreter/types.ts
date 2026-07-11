import type { HttpMethod } from "../schema/index.js";

export interface FetchGuardRequest {
  method: HttpMethod;
  headers: Record<string, string>;
  body?: string;
  signal: AbortSignal;
}

/**
 * Seam between the interpreter and its host. The interpreter only ever
 * calls network endpoints through this function — it never calls global
 * fetch directly. The host (apps/runtime-host, task #4) is responsible for
 * injecting an implementation that enforces the TCB's egress policy (SSRF /
 * private-IP / metadata-IP / DNS-rebinding defenses per plan §5.2); the
 * interpreter itself stays deliberately unaware of that policy.
 */
export type FetchGuard = (url: URL, request: FetchGuardRequest) => Promise<Response>;

export type LoadSpecResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };
