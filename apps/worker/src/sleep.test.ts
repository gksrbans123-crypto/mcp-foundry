import { describe, expect, it } from "vitest";
import { sleep } from "./sleep.js";

describe("sleep", () => {
  it("resolves after roughly the requested delay", async () => {
    const start = Date.now();
    await sleep(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it("resolves immediately if the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const start = Date.now();
    await sleep(500, controller.signal);
    expect(Date.now() - start).toBeLessThan(100);
  });

  it("resolves early when the signal aborts mid-wait", async () => {
    const controller = new AbortController();
    const start = Date.now();
    setTimeout(() => controller.abort(), 10);
    await sleep(500, controller.signal);
    expect(Date.now() - start).toBeLessThan(200);
  });
});
