import { describe, expect, it, vi } from "vitest";
import { computeParsedSpecHash } from "@mcp-foundry/db";
import { buildTestDeps } from "../../test-support/deps.js";
import { buildTestJob, buildTestSpec, buildTestTool } from "../../test-support/fixtures.js";
import { runGeneratingStage } from "./generating.js";

describe("runGeneratingStage", () => {
  it("advances a create job to building with the generated spec and its idempotency hash", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const job = buildTestJob({ type: "create" });
    const deps = buildTestDeps({ generate: async () => ({ rejected: false, spec }) });

    const outcome = await runGeneratingStage(job, deps);

    expect(outcome.kind).toBe("advance");
    if (outcome.kind === "advance") {
      expect(outcome.patch.stage).toBe("building");
      expect(outcome.patch.parsedSpec).toEqual(spec);
      expect(outcome.patch.idempotencyKey).toBe(computeParsedSpecHash(spec));
    }
  });

  it("passes job.input.name through to GenerateRequest.name (create_mcp_server's name param)", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const job = buildTestJob({ type: "create", input: { nl: "make me a weather server", name: "Weather Smoke Test" } });
    const generate = vi.fn(async () => ({ rejected: false as const, spec }));
    const deps = buildTestDeps({ generate });

    await runGeneratingStage(job, deps);

    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ name: "Weather Smoke Test" }));
  });

  it("terminally fails (R7) when generation rejects the request", async () => {
    const job = buildTestJob({ type: "create" });
    const deps = buildTestDeps({
      generate: async () => ({ rejected: true, reason: "outside the DSL envelope: needs branching" }),
    });

    const outcome = await runGeneratingStage(job, deps);

    expect(outcome).toEqual({ kind: "fail", error: "outside the DSL envelope: needs branching" });
  });

  it("overrides the regenerated spec's slug with the existing server's slug for a refine job", async () => {
    const spec = buildTestSpec([buildTestTool()], { slug: "brand-new-slug-from-nl" });
    const deps = buildTestDeps({ generate: async () => ({ rejected: false, spec }) });
    const { server: existing } = await deps.repos.servers.createFromJob({
      userId: "user-1",
      name: "Existing",
      slug: "existing-slug",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "existing-hash",
    });
    const job = buildTestJob({ type: "refine", serverId: existing.id });

    const outcome = await runGeneratingStage(job, deps);

    expect(outcome.kind).toBe("advance");
    if (outcome.kind === "advance") {
      expect((outcome.patch.parsedSpec as { slug: string }).slug).toBe("existing-slug");
    }
  });

  it("fails a refine job when the referenced server does not exist", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const job = buildTestJob({ type: "refine", serverId: "missing-server" });
    const deps = buildTestDeps({ generate: async () => ({ rejected: false, spec }) });

    const outcome = await runGeneratingStage(job, deps);

    expect(outcome.kind).toBe("fail");
  });

  it("fails a refine job that is missing server_id", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const job = buildTestJob({ type: "refine", serverId: null });
    const deps = buildTestDeps({ generate: async () => ({ rejected: false, spec }) });

    const outcome = await runGeneratingStage(job, deps);

    expect(outcome).toEqual({ kind: "fail", error: "refine: missing server_id" });
  });
});
