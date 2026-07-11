import { describe, expect, it, vi } from "vitest";
import { buildTestDeps } from "../../test-support/deps.js";
import { buildTestJob, buildTestSpec, buildTestTool } from "../../test-support/fixtures.js";
import { runDeployingStage } from "./deploying.js";

const spec = buildTestSpec([buildTestTool()]);

describe("runDeployingStage", () => {
  it("fails when the job has no server_id", async () => {
    const job = buildTestJob({ stage: "deploying", parsedSpec: spec, serverId: null });
    const deps = buildTestDeps();

    const outcome = await runDeployingStage(job, deps);

    expect(outcome.kind).toBe("fail");
  });

  it("fails when parsed_spec does not load structurally", async () => {
    const job = buildTestJob({ stage: "deploying", parsedSpec: { not: "valid" }, serverId: "server-1" });
    const deps = buildTestDeps();

    const outcome = await runDeployingStage(job, deps);

    expect(outcome.kind).toBe("fail");
  });

  it("fails when the referenced server does not exist", async () => {
    const job = buildTestJob({ stage: "deploying", parsedSpec: spec, serverId: "missing" });
    const deps = buildTestDeps();

    const outcome = await runDeployingStage(job, deps);

    expect(outcome).toEqual({ kind: "fail", error: "deploying: server missing not found" });
  });

  it("deploys, marks the server active with public URL/deployRef/tools, and advances", async () => {
    const deploy = vi.fn().mockResolvedValue({ publicUrl: "https://foundry.example.com/s/test-server/mcp", deployRef: "file:test-server" });
    const deps = buildTestDeps({ deployer: { deploy, remove: vi.fn() } });
    const { server } = await deps.repos.servers.createFromJob({
      userId: "user-1",
      name: "Test",
      slug: "test-server",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-1",
    });
    const job = buildTestJob({ stage: "deploying", parsedSpec: spec, serverId: server.id });

    const outcome = await runDeployingStage(job, deps);

    expect(outcome).toEqual({ kind: "advance", patch: { stage: "active" } });
    expect(deploy).toHaveBeenCalledWith(spec);
    const updated = await deps.repos.servers.findById(server.id);
    expect(updated?.status).toBe("active");
    expect(updated?.publicUrl).toBe("https://foundry.example.com/s/test-server/mcp");
    expect(updated?.deployRef).toBe("file:test-server");
    expect(updated?.tools).toEqual([{ name: "get_weather", description: spec.tools[0]!.description }]);
  });

  it("R5: skips re-deploying when the server is already active with a public URL (resumed job)", async () => {
    const deploy = vi.fn();
    const deps = buildTestDeps({ deployer: { deploy, remove: vi.fn() } });
    const { server } = await deps.repos.servers.createFromJob({
      userId: "user-1",
      name: "Test",
      slug: "test-server",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-1",
    });
    await deps.repos.servers.update(server.id, {
      status: "active",
      publicUrl: "https://foundry.example.com/s/test-server/mcp",
    });
    const job = buildTestJob({ stage: "deploying", parsedSpec: spec, serverId: server.id });

    const outcome = await runDeployingStage(job, deps);

    expect(outcome).toEqual({ kind: "advance", patch: { stage: "active" } });
    expect(deploy).not.toHaveBeenCalled();
  });
});
