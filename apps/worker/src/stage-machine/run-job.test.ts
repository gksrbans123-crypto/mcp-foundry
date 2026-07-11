import { describe, expect, it, vi } from "vitest";
import type { Job } from "@mcp-foundry/shared";
import type { Queue } from "@mcp-foundry/db";
import { buildTestDeps } from "../test-support/deps.js";
import { buildTestJob, buildTestSpec, buildTestTool } from "../test-support/fixtures.js";
import { runClaimedJob } from "./run-job.js";
import type { PipelineDeps } from "./types.js";

function fakeQueue(overrides: Partial<Queue> = {}): Queue {
  return {
    enqueue: vi.fn(),
    claim: vi.fn(),
    complete: vi.fn().mockImplementation(async (_id, _worker, patch) => ({ ...buildTestJob(), ...patch })),
    fail: vi.fn().mockImplementation(async (_id, _worker, error) => ({ ...buildTestJob(), error, stage: "failed" })),
    ...overrides,
  };
}

describe("runClaimedJob dispatch", () => {
  it("calls queue.complete with the handler's patch on an advance outcome", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const complete = vi.fn().mockResolvedValue(buildTestJob());
    const deps = buildTestDeps({ queue: fakeQueue({ complete }), generate: async () => ({ rejected: false, spec }) });
    const job = buildTestJob({ stage: "queued" });

    await runClaimedJob(job, "worker-1", deps);

    expect(complete).toHaveBeenCalledWith(job.id, "worker-1", expect.objectContaining({ stage: "building" }));
  });

  it("calls queue.fail with terminal:true on a fail outcome", async () => {
    const fail = vi.fn().mockResolvedValue(buildTestJob());
    const deps = buildTestDeps({
      queue: fakeQueue({ fail }),
      generate: async () => ({ rejected: true, reason: "nope" }),
    });
    const job = buildTestJob({ stage: "queued" });

    await runClaimedJob(job, "worker-1", deps);

    expect(fail).toHaveBeenCalledWith(job.id, "worker-1", "nope", { terminal: true });
  });

  it("calls queue.fail with maxAttempts (non-terminal) on a retry outcome", async () => {
    const fail = vi.fn().mockResolvedValue(buildTestJob());
    const deps = buildTestDeps({
      queue: fakeQueue({ fail }),
      validateSpec: () => ({ valid: true, violations: [] }),
      checkCompliance: async () => {
        throw new Error("infra blip");
      },
    });
    const job = buildTestJob({ stage: "validating", parsedSpec: buildTestSpec([buildTestTool()]) });

    await runClaimedJob(job, "worker-1", deps, { maxAttempts: 7 });

    expect(fail).toHaveBeenCalledWith(job.id, "worker-1", expect.stringMatching(/infra blip/), { maxAttempts: 7 });
  });

  it("fails a redeploy job as not-yet-implemented rather than crashing", async () => {
    const fail = vi.fn().mockResolvedValue(buildTestJob());
    const deps = buildTestDeps({ queue: fakeQueue({ fail }) });
    const job = buildTestJob({ type: "redeploy" });

    const outcome = await runClaimedJob(job, "worker-1", deps);

    expect(outcome.kind).toBe("fail");
    expect(fail).toHaveBeenCalled();
  });

  it("fails on an unrecognized stage value rather than throwing", async () => {
    const fail = vi.fn().mockResolvedValue(buildTestJob());
    const deps = buildTestDeps({ queue: fakeQueue({ fail }) });
    const job = buildTestJob({ stage: "active" as Job["stage"] }); // claim() should never hand this out, but dispatch must stay defensive

    const outcome = await runClaimedJob(job, "worker-1", deps);

    expect(outcome.kind).toBe("fail");
  });
});

describe("full create pipeline: queued -> active (task #9 completion criterion)", () => {
  it("advances a create job through every stage to active using only mocked dependencies", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    let currentJob: Job = buildTestJob({ stage: "queued" });

    const queue: Queue = {
      enqueue: vi.fn(),
      claim: vi.fn(),
      complete: vi.fn().mockImplementation(async (_id, _worker, patch) => {
        currentJob = {
          ...currentJob,
          stage: patch.stage,
          status: patch.status ?? patch.stage,
          parsedSpec: "parsedSpec" in patch ? (patch.parsedSpec ?? null) : currentJob.parsedSpec,
          idempotencyKey: patch.idempotencyKey ?? currentJob.idempotencyKey,
          serverId: patch.serverId ?? currentJob.serverId,
          error: null,
        };
        return currentJob;
      }),
      fail: vi.fn().mockImplementation(async (_id, _worker, error) => {
        currentJob = { ...currentJob, stage: "failed", status: "failed", error };
        return currentJob;
      }),
    };

    const generate = vi.fn().mockResolvedValue({ rejected: false, spec });
    const deps: PipelineDeps = buildTestDeps({
      queue,
      generate,
      validateSpec: () => ({ valid: true, violations: [] }),
      checkCompliance: async () => ({ valid: true, violations: [] }),
      probe: async () => ({
        kind: "passed",
        result: { passed: true, measuredAtMs: Date.now(), maxLatencyMs: 120, sampleCount: 20 },
      }),
      deployer: {
        deploy: async () => ({ publicUrl: "https://foundry.example.com/s/test-server/mcp", deployRef: "file:test-server" }),
        remove: vi.fn(),
      },
    });

    const seenStages: string[] = [currentJob.stage];
    for (let i = 0; i < 10 && currentJob.stage !== "active" && currentJob.stage !== "failed"; i++) {
      await runClaimedJob(currentJob, "worker-1", deps);
      seenStages.push(currentJob.stage);
    }

    expect(currentJob.stage).toBe("active");
    expect(currentJob.error).toBeNull();
    expect(seenStages).toEqual(["queued", "building", "validating", "probing", "deploying", "active"]);
    expect(generate).toHaveBeenCalledTimes(1); // never re-invoked once past the generating stage

    const server = await deps.repos.servers.findById(currentJob.serverId!);
    expect(server?.status).toBe("active");
    expect(server?.publicUrl).toBe("https://foundry.example.com/s/test-server/mcp");
    expect(server?.probeResult?.passed).toBe(true);
  });

  it("resumes a job already at the validating stage without ever calling generate (crash-and-restart safety)", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const job = buildTestJob({ stage: "validating", parsedSpec: spec, idempotencyKey: "hash-1" });
    const deps = buildTestDeps({
      queue: fakeQueue(),
      // generate is left as the default "throws if called" fake — proving it's never invoked.
      validateSpec: () => ({ valid: true, violations: [] }),
      checkCompliance: async () => ({ valid: true, violations: [] }),
    });

    const outcome = await runClaimedJob(job, "worker-1", deps);

    expect(outcome).toEqual({ kind: "advance", patch: { stage: "probing" } });
  });
});
