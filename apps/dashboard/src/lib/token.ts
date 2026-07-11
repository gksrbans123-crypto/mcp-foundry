import { createHash } from "node:crypto";

/**
 * Derives the User.authRef lookup key from a raw owner token the same way
 * apps/creator-mcp's SignedOwnerToken issuance is expected to (plan §7:
 * `auth_ref = owner_token_hash`). Plain sha256 needs no shared secret to
 * *look up* a user — only issuing/verifying a token's signature does, and
 * that responsibility belongs to apps/creator-mcp (Task #5), not the
 * read-only dashboard. If Task #5 lands a different derivation, this is the
 * one place to update.
 */
export function hashOwnerToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Renders a token for on-screen display without exposing the full value
 * (plan §6: no secrets in UI-facing output). Short tokens are fully masked
 * rather than risk revealing most of a short secret.
 */
export function maskOwnerToken(rawToken: string): string {
  if (rawToken.length <= 8) return "•".repeat(rawToken.length);
  const head = rawToken.slice(0, 4);
  const tail = rawToken.slice(-4);
  return `${head}${"•".repeat(Math.min(8, rawToken.length - 8))}${tail}`;
}
