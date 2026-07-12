import type { NextFunction, Request, Response } from "express";
import type { TokenBucketLimiter } from "../rate-limit/token-bucket.js";
import type { AuthN } from "./authn.js";

const OWNER_TOKEN_HEADER = "x-owner-token";
const AUTHORIZATION_HEADER = "authorization";

/**
 * Extracts the token from an `Authorization: Bearer <token>` header — the
 * standard MCP OAuth credential. PlayMCP handles the Kakao (kauth) login +
 * consent on its side and, once authorized, forwards the access token here on
 * every request; we map it to a stable identity in AuthN.verify (see
 * signed-owner-token.ts, which reads a JWT `sub` when present so identity
 * survives token rotation).
 */
function extractBearerToken(header: string | string[] | undefined): string | undefined {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1]?.trim() || undefined;
}

export interface CreatorAuth {
  userId: string;
  /** The raw token in effect for this request (just-issued or presented) —
   * always set so tool handlers can embed a working dashboard link on every
   * response, not just the first auto-issue. */
  token: string;
  isNewToken?: boolean;
  /**
   * Key tool handlers must use for the *mutate* rate limiter (HIGH-2). For a
   * request that presented a valid token this is the stable `userId`
   * (matches the per-user 3/min budget as designed). For a request that
   * auto-provisioned a brand-new identity — every request from a caller who
   * never sends the header back — this is the client IP instead, so an
   * attacker can't reset their mutate budget just by discarding the token
   * and minting a new one each call.
   */
  rateLimitKey: string;
}

/**
 * Best-effort client IP for pre-auth throttling. Uses Express's own `req.ip`
 * (respects `app.set("trust proxy", ...)` when configured) rather than
 * reading `X-Forwarded-For` directly — blindly trusting that header without
 * a correctly configured trust-proxy hop count/CIDR would let a client
 * spoof it and bypass this throttle entirely. Production deployments behind
 * a reverse proxy (Fly.io/Railway/Render) MUST set `trust proxy` to the
 * correct hop count for `req.ip` to reflect the real client rather than the
 * proxy's own address.
 */
function clientIpOf(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/**
 * Express middleware wiring AuthN into the request: no header at all
 * auto-issues a fresh owner token (first-call onboarding, not a verify()
 * failure); a present-but-invalid header is rejected with 401 per the
 * PlayMCP review policy's "인증 정보가 없거나 만료된 경우 401" requirement
 * (docs/g-a-oauth-decision.md §3-1). Resolved identity is stashed on
 * `res.locals.creatorAuth` for the /mcp route handler to read.
 *
 * `issuanceLimiter` gates auto-provisioning itself, keyed by client IP
 * (HIGH-2): without it, a caller that never presents a token gets an
 * unlimited number of fresh users/tokens, each with its own untouched rate
 * limit bucket — effectively unbounded LLM cost, queue writes, and users
 * table growth. Exceeding it is a 429, not a 401 (this isn't a bad
 * credential, it's too many new ones).
 */
export function createAuthMiddleware(authn: AuthN, issuanceLimiter: TokenBucketLimiter) {
  return async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    // Prefer an OAuth Bearer token (PlayMCP OAuth / Kakao login) over the
    // custom X-Owner-Token header; fall back to auto-issue when neither is
    // present (a client that authenticated via neither path).
    const ownerHeader = req.headers[OWNER_TOKEN_HEADER];
    const ownerToken = Array.isArray(ownerHeader) ? ownerHeader[0] : ownerHeader;
    const presentedToken = extractBearerToken(req.headers[AUTHORIZATION_HEADER]) ?? ownerToken;

    if (!presentedToken) {
      const ip = clientIpOf(req);
      if (!issuanceLimiter.tryConsume(ip)) {
        res.status(429).json({ error: "rate_limited", message: "too many new owner tokens issued from this address" });
        return;
      }
      const issued = await authn.issueToken();
      const auth: CreatorAuth = {
        userId: issued.userId,
        token: issued.token,
        isNewToken: true,
        rateLimitKey: `ip:${ip}`,
      };
      res.locals.creatorAuth = auth;
      next();
      return;
    }

    const userId = await authn.verify(presentedToken);
    if (!userId) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    const auth: CreatorAuth = { userId, token: presentedToken, rateLimitKey: userId };
    res.locals.creatorAuth = auth;
    next();
  };
}
