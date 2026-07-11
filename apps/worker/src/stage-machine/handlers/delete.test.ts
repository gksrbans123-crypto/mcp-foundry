import { describe, expect, it, vi } from "vitest";
import { buildTestDeps } from "../../test-support/deps.js";
import { buildTestJob } from "../../test-support/fixtures.js";
import { runDeleteJob } from "./delete.js";

describe("runDeleteJob", () => {
  it("fails when the job has no server_id", async () => {
    const job = buildTestJob({ type: "delete", serverId: null });
    const deps = buildTestDeps();

    const outcome = await runDeleteJob(job, deps);

    expect(outcome).toEqual({ kind: "fail", error: "delete job is missing server_id" });
  });

  it("fails when the referenced server does not exist", async () => {
    const job = buildTestJob({ type: "delete", serverId: "missing" });
    const deps = buildTestDeps();

    const outcome = await runDeleteJob(job, deps);

    expect(outcome).toEqual({ kind: "fail", error: "delete: server missing not found" });
  });

  it("removes the deployment and soft-deletes the server, advancing the job", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const deps = buildTestDeps({ deployer: { deploy: vi.fn(), remove } });
    const { server } = await deps.repos.servers.createFromJob({
      userId: "user-1",
      name: "Test",
      slug: "test-server",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-1",
    });
    const job = buildTestJob({ type: "delete", serverId: server.id });

    const outcome = await runDeleteJob(job, deps);

    expect(outcome).toEqual({ kind: "advance", patch: { stage: "active" } });
    expect(remove).toHaveBeenCalledWith("test-server");
    const updated = await deps.repos.servers.findById(server.id);
    expect(updated?.status).toBe("deleted");
  });

  it("is idempotent when the server is already deleted", async () => {
    const deps = buildTestDeps({ deployer: { deploy: vi.fn(), remove: vi.fn().mockResolvedValue(undefined) } });
    const { server } = await deps.repos.servers.createFromJob({
      userId: "user-1",
      name: "Test",
      slug: "test-server",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-1",
    });
    await deps.repos.servers.softDelete(server.id);
    const job = buildTestJob({ type: "delete", serverId: server.id });

    const outcome = await runDeleteJob(job, deps);

    expect(outcome).toEqual({ kind: "advance", patch: { stage: "active" } });
  });
});
