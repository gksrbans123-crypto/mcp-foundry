import { describe, expect, it } from "vitest";
import { CircuitBreakerRegistry } from "./circuit-breaker.js";

describe("CircuitBreakerRegistry", () => {
  it("stays closed below the failure threshold", () => {
    const breaker = new CircuitBreakerRegistry({ failureThreshold: 3, cooldownMs: 1000 });
    breaker.recordFailure("tenant-a");
    breaker.recordFailure("tenant-a");
    expect(breaker.isOpen("tenant-a")).toBe(false);
  });

  it("opens once consecutive failures reach the threshold", () => {
    const breaker = new CircuitBreakerRegistry({ failureThreshold: 3, cooldownMs: 1000 });
    breaker.recordFailure("tenant-a");
    breaker.recordFailure("tenant-a");
    breaker.recordFailure("tenant-a");
    expect(breaker.isOpen("tenant-a")).toBe(true);
  });

  it("a success resets the consecutive-failure count", () => {
    const breaker = new CircuitBreakerRegistry({ failureThreshold: 3, cooldownMs: 1000 });
    breaker.recordFailure("tenant-a");
    breaker.recordFailure("tenant-a");
    breaker.recordSuccess("tenant-a");
    breaker.recordFailure("tenant-a");
    breaker.recordFailure("tenant-a");
    expect(breaker.isOpen("tenant-a")).toBe(false);
  });

  it("closes again automatically once the cooldown elapses", () => {
    const breaker = new CircuitBreakerRegistry({ failureThreshold: 1, cooldownMs: 1000 });
    const start = 1_000_000;
    breaker.recordFailure("tenant-a", start);
    expect(breaker.isOpen("tenant-a", start + 500)).toBe(true);
    expect(breaker.isOpen("tenant-a", start + 1000)).toBe(false);
  });

  it("isolates breaker state per tenant (slug) — one tenant's failures never open another's breaker", () => {
    const breaker = new CircuitBreakerRegistry({ failureThreshold: 2, cooldownMs: 1000 });
    breaker.recordFailure("noisy-tenant");
    breaker.recordFailure("noisy-tenant");
    expect(breaker.isOpen("noisy-tenant")).toBe(true);
    expect(breaker.isOpen("quiet-tenant")).toBe(false);
  });

  it("reopens on a fresh run of failures after closing from cooldown", () => {
    const breaker = new CircuitBreakerRegistry({ failureThreshold: 2, cooldownMs: 100 });
    const start = 0;
    breaker.recordFailure("tenant-a", start);
    breaker.recordFailure("tenant-a", start);
    expect(breaker.isOpen("tenant-a", start + 200)).toBe(false);
    breaker.recordFailure("tenant-a", start + 200);
    breaker.recordFailure("tenant-a", start + 200);
    expect(breaker.isOpen("tenant-a", start + 200)).toBe(true);
  });
});
