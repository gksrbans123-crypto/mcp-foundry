import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiters, createTokenBucketLimiter } from "./token-bucket.js";

describe("createTokenBucketLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to capacity requests, then rejects", () => {
    const limiter = createTokenBucketLimiter({ capacity: 3, refillIntervalMs: 60_000 });
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(false);
  });

  it("tracks separate buckets per key", () => {
    const limiter = createTokenBucketLimiter({ capacity: 1, refillIntervalMs: 60_000 });
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(false);
    expect(limiter.tryConsume("user-2")).toBe(true);
  });

  it("refills over time up to capacity", () => {
    const limiter = createTokenBucketLimiter({ capacity: 2, refillIntervalMs: 60_000 });
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(false);

    vi.setSystemTime(30_000);
    // Half the window elapsed at capacity 2 -> refilled ~1 token.
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(false);

    vi.setSystemTime(90_000);
    expect(limiter.tryConsume("user-1")).toBe(true);
    expect(limiter.tryConsume("user-1")).toBe(true);
  });
});

describe("createRateLimiters", () => {
  it("wires the plan §5 limits: mutate 3/min, query 30/min", () => {
    const limiters = createRateLimiters();

    for (let i = 0; i < 3; i++) expect(limiters.mutate.tryConsume("u")).toBe(true);
    expect(limiters.mutate.tryConsume("u")).toBe(false);

    for (let i = 0; i < 30; i++) expect(limiters.query.tryConsume("u")).toBe(true);
    expect(limiters.query.tryConsume("u")).toBe(false);
  });
});
