import { createHash, createHmac, randomBytes } from "node:crypto";
import type { CreatorUserRepo } from "../repos/types.js";
import type { AuthN } from "./authn.js";

const TOKEN_PAYLOAD_BYTES = 32;

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Reads the claims of a JWT payload without verifying its signature. Used only
 * to pull a stable subject out of an OAuth Bearer token (PlayMCP forwards the
 * kauth-issued access token) so identity survives token rotation — a rotated
 * JWT keeps the same `sub`, whereas hashing the whole token would change. The
 * signature is intentionally NOT checked here: the token arrives from PlayMCP
 * over the authenticated connection, and this identity is a namespace key, not
 * a security boundary (generated servers are public; server_id access is
 * capability-based). Returns null for anything that isn't a 3-part JWT.
 */
function readJwtSubject(token: string): { sub: string; iss?: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1]!, "base64url").toString("utf8")) as unknown;
    if (typeof claims !== "object" || claims === null) return null;
    const { sub, iss } = claims as { sub?: unknown; iss?: unknown };
    if (typeof sub !== "string" || sub.length === 0) return null;
    return { sub, iss: typeof iss === "string" ? iss : undefined };
  } catch {
    return null;
  }
}

/**
 * Maps any presented credential to the stable lookup key used for identity:
 * an OAuth Bearer JWT resolves to its issuer+subject (rotation-stable), while
 * an opaque token (auto-issued signed token OR a user-chosen X-Owner-Token
 * value) is hashed whole. Both go through sha256 so the stored authRef never
 * contains a raw secret.
 */
function deriveAuthRef(token: string): string {
  const jwt = readJwtSubject(token);
  if (jwt) return hashToken(`oauth-sub:${jwt.iss ?? ""}:${jwt.sub}`);
  return hashToken(token);
}

export interface SignedOwnerTokenConfig {
  secret: string;
  users: CreatorUserRepo;
}

/**
 * AuthN impl A (plan §9, docs/g-a-oauth-decision.md): a bearer token carried
 * in the `X-Owner-Token` custom header.
 *
 * `issueToken` mints a random `<payload>.<hmac>` token for first-call
 * onboarding. `verify`, however, treats the header as a stable *namespace*
 * key rather than a signed credential: it accepts ANY non-empty token and
 * derives identity as `sha256(<the whole raw token>)`. This is deliberate —
 *   1. it matches apps/dashboard's derivation (src/lib/token.ts
 *      `hashOwnerToken`), which has always just hashed whatever the user
 *      pastes, with no signature check; and
 *   2. it lets a user pin identity by typing their own value into PlayMCP's
 *      custom-header connector, so `list_my_servers` / the dashboard persist
 *      across PlayMCP's per-call anonymous connections (which otherwise mint a
 *      fresh user every call — see the identity-fragmentation note in
 *      tools/get-job-status.ts).
 *
 * The token is a "which servers are mine" namespace, NOT a hard security
 * boundary: every generated server is a public MCP endpoint and server_id
 * access is already capability-based. Callers should pick a long, unique,
 * hard-to-guess value to avoid sharing a namespace with someone else.
 */
export function createSignedOwnerTokenAuthN(config: SignedOwnerTokenConfig): AuthN {
  const { secret, users } = config;

  return {
    async issueToken() {
      const payload = randomBytes(TOKEN_PAYLOAD_BYTES).toString("base64url");
      const token = `${payload}.${sign(secret, payload)}`;
      const user = await users.findOrCreateByAuthRef(hashToken(token));
      return { userId: user.id, token };
    },

    async verify(token) {
      if (!token) return null;
      const user = await users.findOrCreateByAuthRef(deriveAuthRef(token));
      return user.id;
    },
  };
}
