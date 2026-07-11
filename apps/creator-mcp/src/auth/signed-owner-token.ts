import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { CreatorUserRepo } from "../repos/types.js";
import type { AuthN } from "./authn.js";

const TOKEN_PAYLOAD_BYTES = 32;

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function verifySignature(secret: string, token: string): boolean {
  const separatorIndex = token.indexOf(".");
  if (separatorIndex <= 0) return false;
  const payload = token.slice(0, separatorIndex);
  const presented = token.slice(separatorIndex + 1);
  const expected = sign(secret, payload);
  const presentedBuf = Buffer.from(presented, "hex");
  const expectedBuf = Buffer.from(expected, "hex");
  if (presentedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(presentedBuf, expectedBuf);
}

export interface SignedOwnerTokenConfig {
  secret: string;
  users: CreatorUserRepo;
}

/**
 * AuthN impl A (plan §9, docs/g-a-oauth-decision.md): a self-issued bearer
 * token carried in the `X-Owner-Token` custom header.
 *
 * Token shape is `<payload>.<hmac>` where `hmac = HMAC-SHA256(secret,
 * payload)` — a malformed/forged token is rejected by recomputing the HMAC
 * alone, with no database round trip. Once the signature checks out, the
 * user-identity lookup key is `sha256(<the whole raw token>)`, matching
 * apps/dashboard's independent derivation (src/lib/token.ts `hashOwnerToken`)
 * of the same value from a token a user pastes into the dashboard — both
 * sides must hash the full token identically, not just the payload.
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
      if (!token || !verifySignature(secret, token)) return null;
      const user = await users.findOrCreateByAuthRef(hashToken(token));
      return user.id;
    },
  };
}
