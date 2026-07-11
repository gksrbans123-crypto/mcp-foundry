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

  it("refine job: fails when server_id is missing", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const job = buildTestJob({ type: "refine", serverId: null, parsedSpec: spec });
    const deps = buildTestDeps();

    const outcome = await runBuildingStage(job, deps);

    expect(outcome).toEqual({ kind: "fail", error: "building: refine job is missing server_id" });
  });
});
