import type { ToolSpec } from "../schema/index.js";

/**
 * Structural parameter binding: every value is percent-encoded through
 * encodeURIComponent before it touches the URL, so a malicious argument
 * (e.g. "../evil" or "example.com/@attacker") can never change the URL's
 * structure — only occupy the single path segment it was substituted into.
 * The urlTemplate's host segment can never contain a `{token}` in the first
 * place (enforced by URL_TEMPLATE_PATTERN at schema load time), so this
 * function only ever substitutes within the path.
 */
export function buildRequestUrl(tool: ToolSpec, args: Record<string, unknown>): URL {
  let path = tool.request.urlTemplate;
  for (const [name, value] of Object.entries(args)) {
    const token = `{${name}}`;
    if (path.includes(token)) {
      path = path.split(token).join(encodeURIComponent(String(value)));
    }
  }

  const url = new URL(path);
  for (const mapping of tool.request.query) {
    const value = mapping.param !== undefined ? args[mapping.param] : mapping.value;
    if (value !== undefined) {
      url.searchParams.set(mapping.key, String(value));
    }
  }
  return url;
}

export function buildRequestHeaders(tool: ToolSpec): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const header of tool.request.headers) {
    headers[header.name] = header.value;
  }
  return headers;
}

/** Returns undefined for GET/no-body tools; a JSON string body otherwise. */
export function buildRequestBody(tool: ToolSpec, args: Record<string, unknown>): string | undefined {
  if (tool.request.body === null) return undefined;

  const body: Record<string, unknown> = {};
  for (const mapping of tool.request.body.fields) {
    const value = mapping.param !== undefined ? args[mapping.param] : mapping.value;
    if (value !== undefined) {
      body[mapping.key] = value;
    }
  }
  return JSON.stringify(body);
}

/**
 * Canonical, order-independent serialization of validated call arguments.
 * Intended for reuse by the cache-key builder in apps/runtime-host, whose
 * R4 invariant is `cacheKey = tenant + tool + normalizeToolArgs(args)`.
 */
export function normalizeToolArgs(args: Record<string, unknown>): string {
  const sortedKeys = Object.keys(args).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    normalized[key] = args[key];
  }
  return JSON.stringify(normalized);
}
