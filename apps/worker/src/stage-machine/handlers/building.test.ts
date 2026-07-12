import { describe, expect, it, vi } from "vitest";
import { buildTestDeps } from "../../test-support/deps.js";
import { buildTestJob, buildTestSpec, buildTestTool } from "../../test-support/fixtures.js";
import { runBuildingStage } from "./building.js";

describe("runBuildingStage", () => {
  it("create job: creates the server row (R5-idempotent) and advances with serverId set", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const job = buildTestJob({ type: "create", parsedSpec: spec, idempotencyKey: "hash-1" });
    const deps = buildTestDeps();

    const outcome = await runBuildingStage(job, deps);

    expect(outcome.kind).toBe("advance");
    if (outcome.kind === "advance") {
      expect(outcome.patch.stage).toBe("validating");
      expect(typeof outcome.patch.serverId).toBe("string");
      const server = await deps.repos.servers.findById(outcome.patch.serverId!);
      expect(server?.slug).toBe(spec.slug);
      expect(server?.status).toBe("building");
    }
  });

  it("create job: fails when the job has no idempotency key", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const job = buildTestJob({ type: "create", parsedSpec: spec, idempotencyKey: null });
    const deps = buildTestDeps();

    const outcome = await runBuildingStage(job, deps);

    expect(outcome).toEqual({ kind: "fail", error: "building: missing idempotency key for create job" });
  });

  it("fails when parsed_spec does not load structurally", async () => {
    const job = buildTestJob({ type: "create", parsedSpec: { not: "a valid spec" }, idempotencyKey: "hash-1" });
    const deps = buildTestDeps();

    const outcome = await runBuildingStage(job, deps);

    expect(outcome.kind).toBe("fail");
  });

  it("refine job: does not create a new server row, just advances", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const job = buildTestJob({ type: "refine", serverId: "server-1", parsedSpec: spec });
    const deps = buildTestDeps({
      repos: {
        servers: {
          createFromJob: vi.fn().mockRejectedValue(new Error("must not be called for refine")),
          findById: async () => null,
          update: vi.fn(),
          softDelete: vi.fn(),
        },
      },
    });

    const outcome = await runBuildingStage(job, deps);

    expect(outcome).toEqual({ kind: "advance", patch: { stage: "validating" } });
  });

  it("create job: slug collision retries once with a per-job suffix and persists it into parsed_spec", async () => {
    const deps = buildTestDeps();
    const spec = buildTestSpec([buildTestTool()]);
    const first = buildTestJob({ id: "job-1", type: "create", parsedSpec: spec, idempotencyKey: "hash-1" });
    const second = buildTestJob({ id: "A1B2-C3D4-E5F6", type: "create", parsedSpec: spec, idempotencyKey: "hash-2" });

    await runBuildingStage(first, deps);
    const outcome = await runBuildingStage(second, deps);

    expect(outcome.kind).toBe("advance");
    if (outcome.kind === "advance") {
      const server = await deps.repos.servers.findById(outcome.patch.serverId!);
      expect(server?.slug).toBe("test-server-a1b2c3");
      expect((outcome.patch.parsedSpec as { slug?: string }).slug).toBe("test-server-a1b2c3");
    }
  });

  it("create job: fails with a clear error when the de-collided slug is also taken", async () => {
    const deps = buildTestDeps();
    const spec = buildTestSpec([buildTestTool()]);
    const jobs = [
      buildTestJob({ id: "job-1", type: "create", parsedSpec: spec, idempotencyKey: "hash-1" }),
      buildTestJob({ id: "abc123-first", type: "create", parsedSpec: spec, idempotencyKey: "hash-2" }),
      buildTestJob({ id: "abc123-second", type: "create", parsedSpec: spec, idempotencyKey: "hash-3" }),
    ];

    await runBuildingStage(jobs[0], deps);
    await runBuildingStage(jobs[1], deps); // takes "test-server-abc123"
    const outcome = await runBuildingStage(jobs[2], deps); // same suffix source -> both taken

    expect(outcome.kind).toBe("fail");
    if (outcome.kind === "fail") {
      expect(outcome.error).toContain("test-server");
      expect(outcome.error).toContain("test-server-abc123");
    }
  });

  it("refine job: fails when server_id is missing", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const job = buildTestJob({ type: "refine", serverId: null, parsedSpec: spec });
    const deps = buildTestDeps();

    const outcome = await runBuildingStage(job, deps);

    expect(outcome).toEqual({ kind: "fail", error: "building: refine job is missing server_id" });
  });
});
