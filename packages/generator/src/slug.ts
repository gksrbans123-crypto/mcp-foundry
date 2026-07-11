// Shared derivation helpers so templates and the HTTP-wrapper fallback
// produce identifiers that satisfy packages/spec's SLUG_PATTERN and
// NAME_PATTERN without each caller re-implementing sanitization.

export function toSlug(text: string): string {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
  return slug.length > 0 ? slug.replace(/^-+|-+$/g, "") : "generated-server";
}

export function toToolName(text: string, prefix = "get"): string {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const name = `${prefix}_${words}`.replace(/_+/g, "_").slice(0, 128);
  return name.length > 0 ? name : `${prefix}_result`;
}

export function toIdentifier(text: string): string {
  const camel = text
    .replace(/[^A-Za-z0-9]+(.)/g, (_match, char: string) => char.toUpperCase())
    .replace(/[^A-Za-z0-9]/g, "");
  const identifier = camel.length > 0 ? camel : "value";
  return /^[0-9]/.test(identifier) ? `f${identifier}`.slice(0, 64) : identifier.slice(0, 64);
}
