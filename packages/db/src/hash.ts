import { createHash } from "node:crypto";

/**
 * Deterministically stringifies a JSON-like value with object keys sorted,
 * so two structurally-equal specs hash identically regardless of the key
 * insertion order a caller (or Postgres jsonb round-trip) happened to use.
 */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, val]) => [key, canonicalize(val)] as const);
    return Object.fromEntries(sortedEntries);
  }
  return value;
}

/**
 * Computes the deploy idempotency key required by R5: sha256 of the
 * canonicalized parsed_spec. Two jobs producing the same declarative spec
 * hash identically, which the servers.idempotency_key UNIQUE constraint
 * then uses to block duplicate public URLs for the same spec.
 */
export function computeParsedSpecHash(parsedSpec: unknown): string {
  const canonicalJson = JSON.stringify(canonicalize(parsedSpec));
  return createHash("sha256").update(canonicalJson).digest("hex");
}
