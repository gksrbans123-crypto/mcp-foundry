import type { FieldSelector } from "../schema/index.js";

const PATH_TOKEN_PATTERN = /\[(\d+)\]|([^.[\]]+)/g;

type PathToken = { kind: "key"; key: string } | { kind: "index"; index: number };

function tokenizePath(path: string): PathToken[] {
  const tokens: PathToken[] = [];
  for (const match of path.matchAll(PATH_TOKEN_PATTERN)) {
    if (match[1] !== undefined) {
      tokens.push({ kind: "index", index: Number(match[1]) });
    } else if (match[2] !== undefined) {
      tokens.push({ kind: "key", key: match[2] });
    }
  }
  return tokens;
}

/**
 * Walks a parsed JSON value following a field selector's path. Returns
 * undefined for any missing key, out-of-range index, or type mismatch
 * instead of throwing — an unpredictable upstream response shape must never
 * crash the interpreter, only surface as a blank field in the rendered
 * markdown.
 */
function resolvePath(root: unknown, path: string): unknown {
  let current: unknown = root;
  for (const token of tokenizePath(path)) {
    if (current === null || current === undefined) return undefined;
    if (token.kind === "index") {
      if (!Array.isArray(current)) return undefined;
      current = current[token.index];
    } else {
      if (typeof current !== "object" || Array.isArray(current)) return undefined;
      current = (current as Record<string, unknown>)[token.key];
    }
  }
  return current;
}

export function selectFields(selectors: FieldSelector[], data: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const selector of selectors) {
    fields[selector.name] = resolvePath(data, selector.path);
  }
  return fields;
}

const MARKDOWN_TOKEN_PATTERN = /\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g;
const MISSING_FIELD_PLACEHOLDER = "—";

/**
 * Pure substitution only — no conditionals, loops, or expressions. A
 * missing/undefined field renders as a fixed placeholder rather than
 * throwing, so a partial upstream response still produces a readable
 * (if incomplete) markdown result.
 */
export function renderMarkdownTemplate(template: string, fields: Record<string, unknown>): string {
  return template.replace(MARKDOWN_TOKEN_PATTERN, (_match, name: string) => {
    const value = fields[name];
    return value === undefined || value === null ? MISSING_FIELD_PLACEHOLDER : String(value);
  });
}

/**
 * Renders a sanitized, engine-authored markdown error. Callers must never
 * pass raw upstream response bodies into `details` — only our own
 * validation/engine-generated strings — so upstream data can never leak
 * into an error message unfiltered.
 */
export function renderErrorMarkdown(title: string, details: string[] = []): string {
  const lines = [`**Error:** ${title}`];
  for (const detail of details.slice(0, 10)) {
    lines.push(`- ${detail}`);
  }
  return lines.join("\n");
}
