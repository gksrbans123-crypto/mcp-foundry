import { describe, expect, it } from "vitest";
import { ConcurrencyLimiter } from "./concurrency-limiter.js";

describe("ConcurrencyLimiter", () => {
  it("allows up to maxConcurrent acquisitions immediately", async () => {
    const limiter = new ConcurrencyLimiter(2);
    const release1 = await limiter.acquire("tenant-a");
    const release2 = await limiter.acquire("tenant-a");
    expect(limiter.activeCount("tenant-a")).toBe(2);
    release1();
    release2();
  });

  it("queues an acquisition beyond the limit until a slot is released", async () => {
    const limiter = new ConcurrencyLimiter(1);
    const release1 = await limiter.acquire("tenant-a");

    let acquired = false;
    const pending = limiter.acquire("tenant-a").then((release) => {
      acquired = true;
      return release;
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(acquired).toBe(false);
    expect(limiter.queuedCount("tenant-a")).toBe(1);

    release1();
    const release2 = await pending;
    expect(acquired).toBe(true);
    release2();
  });

  it("tracks separate tenants (slugs) independently", async () => {
    const limiter = new ConcurrencyLimiter(1);
    const releaseA = await limiter.acquire("tenant-a");
    // tenant-b's slot is unaffected by tenant-a holding its slot.
    const releaseB = await limiter.acquire("tenant-b");
    expect(limiter.activeCount("tenant-a")).toBe(1);
    expect(limiter.activeCount("tenant-b")).toBe(1);
    releaseA();
    releaseB();
  });

  it("never exceeds maxConcurrent even under a burst of queued acquisitions", async () => {
    const limiter = new ConcurrencyLimiter(2);
    const releases: Array<() => void> = [];
    let maxObserved = 0;

    const attempts = Array.from({ length: 6 }, async () => {
      const release = await limiter.acquire("tenant-a");
      maxObserved = Math.max(maxObserved, limiter.activeCount("tenant-a"));
      releases.push(release);
    });

    // Release slots as they arrive so queued waiters can proceed one at a time.
    const releaser = (async () => {
      for (let i = 0; i < 6; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        releases.shift()?.();
      }
    })();

    await Promise.all([Promise.all(attempts), releaser]);
    expect(maxObserved).toBeLessThanOrEqual(2);
  });
});
