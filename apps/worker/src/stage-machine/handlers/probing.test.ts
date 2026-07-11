import { describe, expect, it } from "vitest";
import { buildTestDeps } from "../../test-support/deps.js";
import { buildTestJob, buildTestSpec, buildTestTool } from "../../test-support/fixtures.js";
import { runProbingStage } from "./probing.js";

const spec = buildTestSpec([buildTestTool()]);
const passedResult = { passed: true, measuredAtMs: Date.now(), maxLatencyMs: 100, sampleCount: 20 };

describe("runProbingStage", () => {
  it("fails when parsed_spec does not load structurally", async () => {
    const job = buildTestJob({ stage: "probing", parsedSpec: { not: "valid" } });
    const deps = buildTestDeps();

    const outcome = await runProbingStage(job, deps);

    expect(outcome.kind).toBe("fail");
  });

  it("persists probe_result on the server and advances to deploying when the gate passes", async () => {
    const deps = buildTestDeps({ probe: async () => ({ kind: "passed", result: passedResult }) });
    const { server } = await deps.repos.servers.createFromJob({
      userId: "user-1",
      name: "Test",
      slug: "test-server",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-1",
    });
    const job = buildTestJob({ stage: "probing", parsedSpec: spec, serverId: server.id });

    const outcome = await runProbingStage(job, deps);

    expect(outcome).toEqual({ kind: "advance", patch: { stage: "deploying" } });
    const updated = await deps.repos.servers.findById(server.id);
    expect(updated?.probeResult).toEqual(passedResult);
  });

  it("does not touch the repo when the job has no server_id yet", async () => {
    const deps = buildTestDeps({ probe: async () => ({ kind: "passed", result: passedResult }) });
    const job = buildTestJob({ stage: "probing", parsedSpec: spec, serverId: null });

    const outcome = await runProbingStage(job, deps);

    expect(outcome).toEqual({ kind: "advance", patch: { stage: "deploying" } });
  });

  it("retries when the probe reports a transient upstream failure (R3)", async () => {
    const deps = buildTestDeps({ probe: async () => ({ kind: "transient", reason: "upstream unreachable" }) });
    const job = buildTestJob({ stage: "probing", parsedSpec: spec });

    const outcome = await runProbingStage(job, deps);

    expect(outcome).toEqual({ kind: "retry", error: "upstream unreachable" });
  });

  it("hard-fails when the probe reports the latency gate was exceeded (R2)", async () => {
    const deps = buildTestDeps({
      probe: async () => ({
        kind: "failed",
        result: { passed: false, measuredAtMs: Date.now(), maxLatencyMs: 3000, sampleCount: 20 },
        reason: "observed max latency 3000ms exceeds the 2000ms gate (R2)",
      }),
    });
    const job = buildTestJob({ stage: "probing", parsedSpec: spec });

    const outcome = await runProbingStage(job, deps);

    expect(outcome).toEqual({ kind: "fail", error: "observed max latency 3000ms exceeds the 2000ms gate (R2)" });
  });
});
