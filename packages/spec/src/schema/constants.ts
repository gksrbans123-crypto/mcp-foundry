/**
 * Shared patterns and limits for the declarative server-spec DSL (plan §4).
 * These are structural/security bounds only — business policy (min/max tool
 * counts, forbidden-substring checks) lives in packages/validator (task #7).
 */

// Tool/server identifiers: plan §3 "[A-Za-z0-9_-] 1~128자".
export const NAME_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

// Display name shown in the dashboard/tool metadata — more permissive than
// NAME_PATTERN since it is never used as a URL segment.
export const TITLE_PATTERN = /^[\s\S]{1,128}$/;

// Path segment used in the generated server's public URL
// (https://{host}/s/{slug}/mcp) — DNS-label-like, lowercase only.
export const SLUG_PATTERN = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

// MCP protocol version pinned to the ISO-date scheme used by the spec
// (plan §7/§8: 2025-03-26 ~ 2025-11-25). ISO date strings compare
// lexicographically, so bounds can be checked with plain string comparison.
export const MCP_VERSION_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MIN_MCP_VERSION = "2025-03-26";
export const MAX_MCP_VERSION = "2025-11-25";

// Identifier for declared input parameters and field-selector names —
// referenced from urlTemplate `{param}` tokens and markdown `{{name}}`
// tokens, so it must be safe to embed in both without escaping.
export const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;

// Query/body wire keys sent to the upstream API — looser than
// IDENTIFIER_PATTERN (upstream APIs commonly use dots, e.g. "current_2m").
export const WIRE_KEY_PATTERN = /^[A-Za-z0-9_.-]{1,64}$/;

// urlTemplate is restricted so `{param}` substitution can only ever land in
// the path, never in the scheme/host/port — the host segment's character
// class deliberately excludes `{` and `}`. No query string is allowed here;
// query parameters must go through request.query so every value is bound
// through URLSearchParams instead of raw string interpolation.
export const URL_TEMPLATE_PATTERN =
  /^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9\-._~%{}/]*)?$/;

// JSON-path-like selector into a parsed upstream response, e.g.
// "daily.temperature_2m_max[0]" or "[0].current.temperature_2m".
export const FIELD_PATH_PATTERN = /^(\[\d+\]|[A-Za-z0-9_]+)(\.[A-Za-z0-9_]+|\[\d+\])*$/;

export const ALLOWED_HEADER_NAMES = ["accept", "user-agent", "content-type"] as const;

export const CACHE_TTL_MAX_SECONDS = 300;
export const DEFAULT_TIMEOUT_MS = 2500;
export const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;
