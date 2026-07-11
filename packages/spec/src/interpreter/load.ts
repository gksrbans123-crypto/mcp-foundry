import { serverSpecSchema, type ServerSpec } from "../schema/index.js";
import type { LoadSpecResult } from "./types.js";

/**
 * Loads and validates a raw (untrusted) spec payload against the DSL schema.
 * All whitelist/structural checks (allowed fields, https-only URLs, header
 * allowlist, declared-parameter references, cache-TTL invariant) live in the
 * zod schema itself (packages/spec/src/schema) — this function's job is
 * just to run that validation and surface readable errors, never to
 * partially trust an invalid spec.
 */
export function loadServerSpec(raw: unknown): LoadSpecResult<ServerSpec> {
  const result = serverSpecSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
    });
    return { ok: false, errors };
  }
  return { ok: true, value: result.data };
}
