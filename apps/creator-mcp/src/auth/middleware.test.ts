import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { createTokenBucketLimiter, type TokenBucketLimiter } from "../rate-limit/token-bucket.js";
import type { AuthN } from "./authn.js";
import { createAuthMiddleware } from "./middleware.js";

function buildReqRes(options: { headerValue?: string; authorization?: string; ip?: string } = {}): {
  req: Request;
  res: Response;
  next: NextFunction;
} {
  const headers: Record<string, string> = {};
  if (options.headerValue) headers["x-owner-token"] = options.headerValue;
  if (options.authorization) headers.authorization = options.authorization;
  const req = {
    headers,
    ip: options.ip ?? "127.0.0.1",
    socket: { remoteAddress: options.ip ?? "127.0.0.1" },
  } as unknown as Request;
  const res = {
    locals: {},
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;
  return { req, res, next };
}

function unlimitedIssuanceLimiter(): TokenBucketLimiter {
  return createTokenBucketLimiter({ capacity: 1000, refillIntervalMs: 60_000 });
}

describe("createAuthMiddleware", () => {
  it("auto-issues a token and calls next() when no header is present", async () => {
    const authn: AuthN = {
      issueToken: vi.fn().mockResolvedValue({ userId: "user-1", token: "new-token" }),
      verify: vi.fn(),
    };
    const middleware = createAuthMiddleware(authn, unlimitedIssuanceLimiter());
    const { req, res, next } = buildReqRes();

    await middleware(req, res, next);

    expect(authn.issueToken).toHaveBeenCalledOnce();
    expect(res.locals.creatorAuth).toEqual({
      userId: "user-1",
      token: "new-token",
      isNewToken: true,
      rateLimitKey: "ip:127.0.0.1",
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("calls next() with the resolved userId (as the rate limit key) when the header verifies", async () => {
    const authn: AuthN = {
      issueToken: vi.fn(),
      verify: vi.fn().mockResolvedValue("user-42"),
    };
    const middleware = createAuthMiddleware(authn, unlimitedIssuanceLimiter());
    const { req, res, next } = buildReqRes({ headerValue: "valid-token" });

    await middleware(req, res, next);

    expect(authn.verify).toHaveBeenCalledWith("valid-token");
    expect(res.locals.creatorAuth).toEqual({ userId: "user-42", token: "valid-token", rateLimitKey: "user-42" });
    expect(next).toHaveBeenCalledOnce();
  });

  it("ignores an Authorization header (OAuth dropped) and auto-issues instead", async () => {
    const authn: AuthN = {
      issueToken: vi.fn().mockResolvedValue({ userId: "user-1", token: "new-token" }),
      verify: vi.fn(),
    };
    const middleware = createAuthMiddleware(authn, unlimitedIssuanceLimiter());
    const { req, res, next } = buildReqRes({ authorization: "Bearer header.payload.sig" });

    await middleware(req, res, next);

    expect(authn.verify).not.toHaveBeenCalled();
    expect(authn.issueToken).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it("responds 401 and does not call next() when the header fails to verify", async () => {
    const authn: AuthN = {
      issueToken: vi.fn(),
      verify: vi.fn().mockResolvedValue(null),
    };
    const middleware = createAuthMiddleware(authn, unlimitedIssuanceLimiter());
    const { req, res, next } = buildReqRes({ headerValue: "invalid-token" });

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  // --- HIGH-2 -------------------------------------------------------------
  // Without an issuance throttle, a caller that never sends X-Owner-Token
  // gets a brand-new user/token (and thus a brand-new, untouched rate-limit
  // bucket) on every single request — defeating the per-user mutate limiter
  // entirely and letting an anonymous caller mint unlimited jobs. These
  // tests verify the fix directly: repeated anonymous calls from the same
  // IP eventually get throttled at issuance time, before a new identity (and
  // its own fresh bucket) is ever created.

  it("throttles token auto-issuance per IP: the (capacity+1)th anonymous call from the same address is rejected", async () => {
    const authn: AuthN = {
      issueToken: vi.fn().mockImplementation(async () => ({ userId: `user-${Math.random()}`, token: "tok" })),
      verify: vi.fn(),
    };
    const issuanceLimiter = createTokenBucketLimiter({ capacity: 2, refillIntervalMs: 60_000 });
    const middleware = createAuthMiddleware(authn, issuanceLimiter);

    const first = buildReqRes({ ip: "10.0.0.1" });
    await middleware(first.req, first.res, first.next);
    expect(first.next).toHaveBeenCalledOnce();

    const second = buildReqRes({ ip: "10.0.0.1" });
    await middleware(second.req, second.res, second.next);
    expect(second.next).toHaveBeenCalledOnce();

    const third = buildReqRes({ ip: "10.0.0.1" });
    await middleware(third.req, third.res, third.next);

    expect(third.next).not.toHaveBeenCalled();
    expect(third.res.status).toHaveBeenCalledWith(429);
    expect(authn.issueToken).toHaveBeenCalledTimes(2); // never called for the throttled 3rd request
  });

  it("tracks the issuance throttle per IP independently — a different address is unaffected", async () => {
    const authn: AuthN = {
      issueToken: vi.fn().mockImplementation(async () => ({ userId: `user-${Math.random()}`, token: "tok" })),
      verify: vi.fn(),
    };
    const issuanceLimiter = createTokenBucketLimiter({ capacity: 1, refillIntervalMs: 60_000 });
    const middleware = createAuthMiddleware(authn, issuanceLimiter);

    const fromIpA = buildReqRes({ ip: "10.0.0.1" });
    await middleware(fromIpA.req, fromIpA.res, fromIpA.next);
    expect(fromIpA.next).toHaveBeenCalledOnce();

    const alsoFromIpA = buildReqRes({ ip: "10.0.0.1" });
    await middleware(alsoFromIpA.req, alsoFromIpA.res, alsoFromIpA.next);
    expect(alsoFromIpA.res.status).toHaveBeenCalledWith(429);

    const fromIpB = buildReqRes({ ip: "10.0.0.2" });
    await middleware(fromIpB.req, fromIpB.res, fromIpB.next);
    expect(fromIpB.next).toHaveBeenCalledOnce();
  });

  it("gives every auto-issued identity from the same IP the same rateLimitKey", async () => {
    const authn: AuthN = {
      issueToken: vi
        .fn()
        .mockResolvedValueOnce({ userId: "user-a", token: "tok-a" })
        .mockResolvedValueOnce({ userId: "user-b", token: "tok-b" }),
      verify: vi.fn(),
    };
    const middleware = createAuthMiddleware(authn, createTokenBucketLimiter({ capacity: 10, refillIntervalMs: 60_000 }));

    const first = buildReqRes({ ip: "10.0.0.5" });
    await middleware(first.req, first.res, first.next);
    const second = buildReqRes({ ip: "10.0.0.5" });
    await middleware(second.req, second.res, second.next);

    // Two different users, minted from the same IP — same rateLimitKey, so
    // a mutate tool handler keying its bucket off rateLimitKey (not userId)
    // sees these as the same caller for rate-limiting purposes.
    expect((first.res.locals.creatorAuth as { rateLimitKey: string }).rateLimitKey).toBe("ip:10.0.0.5");
    expect((second.res.locals.creatorAuth as { rateLimitKey: string }).rateLimitKey).toBe("ip:10.0.0.5");
  });
});
