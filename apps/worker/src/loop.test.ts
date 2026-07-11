import { describe, expect, it, vi } from "vitest";
import type { Job } from "@mcp-foundry/shared";
import type { Queue } from "@mcp-foundry/db";
import { buildTestDeps } from "./test-support/deps.js";
import { buildTestJob } from "./test-support/fixtures.js";
import { runWorkerLoopOnce, startWorkerLoop } from "./loop.js";

const options = { pollIntervalMs: 5, staleLockMs: 60_000, maxAttempts: 5 };

describe("runWorkerLoopOnce", () => {
  it("returns false and does nothing else when there is no claimable job", async () => {
    const claim = vi.fn().mockResolvedValue(null);
    const deps = buildTestDeps({ queue: { enqueue: vi.fn(), claim, complete: vi.fn(), fail: vi.fn() } });

    const processed = await runWorkerLoopOnce("worker-1", deps, options);

    expect(processed).toBe(false);
  });

  it("fails the job (non-terminal, retryable) instead of crashing when a stage handler throws", async () => {
    const job: Job = buildTestJob({ stage: "queued" });
    const fail = vi.fn().mockResolvedValue(job);
    const queue: Queue = { enqueue: vi.fn(), claim: vi.fn().mockResolvedValue(job), complete: vi.fn(), fail };
    const deps = buildTestDeps({
      queue,
      generate: async () => {
        throw new Error("unexpected LLM client crash");
      },
    });

    const processed = await runWorkerLoopOnce("worker-1", deps, options);

    expect(processed).toBe(true);
    expect(fail).toHaveBeenCalledWith(
      job.id,
      "worker-1",
      expect.stringMatching(/unhandled worker error.*unexpected LLM client crash/),
      { maxAttempts: 5 },
    );
  });
});

describe("startWorkerLoop", () => {
  it("stops polling once the signal aborts", async () => {
    const claim = vi.fn().mockResolvedValue(null);
    const deps = buildTestDeps({ queue: { enqueue: vi.fn(), claim, complete: vi.fn(), fail: vi.fn() } });
    const controller = new AbortController();

    const loopPromise = startWorkerLoop("worker-1", deps, options, controller.signal);
    await new Promise((resolve) => setTimeout(resolve, 12));
    controller.abort();
    await loopPromise;

    expect(claim.mock.calls.length).toBeGreaterThan(0);
  });
});
