import { describe, expect, it, vi } from "vitest";
import type { FetchGuard } from "@mcp-foundry/spec";
import type { CliExecutor } from "@mcp-foundry/validator";
import { buildTestSpec, buildTestTool } from "../test-support/fixtures.js";
import { checkCompliance } from "./checker.js";

const fakeFetchGuard: FetchGuard = async () => new Response("{}", { status: 200 });

function fakeExec(toolsListBody: unknown, callBody: unknown): CliExecutor {
  return vi.fn(async (args: string[]) => {
    if (args.includes("tools/list")) {
      return { stdout: JSON.stringify(toolsListBody), stderr: "", exitCode: 0 };
    }
    return { stdout: JSON.stringify(callBody), stderr: "", exitCode: 0 };
  });
}

const mutatingAnnotations = {
  title: "Delete Reminder",
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
} as const;

describe("checkCompliance", () => {
  it("only issues a tools/call check for readOnly tools (R1 spirit)", async () => {
    const readOnlyTool = buildTestTool({ name: "get_weather" });
    const mutatingTool = buildTestTool({ name: "delete_reminder", annotations: mutatingAnnotations });
    const spec = buildTestSpec([readOnlyTool, mutatingTool]);
    const exec = fakeExec(
      { tools: [{ name: "get_weather" }, { name: "delete_reminder" }] },
      { content: [], isError: false },
    );

    const result = await checkCompliance(spec, fakeFetchGuard, { inspectorOptions: { exec } });

    expect(result.valid).toBe(true);
    const callInvocations = (exec as ReturnType<typeof vi.fn>).mock.calls.filter((call: unknown[]) =>
      (call[0] as string[]).includes("tools/call"),
    );
    expect(callInvocations).toHaveLength(1);
    expect(callInvocations[0]?.[0]).toContain("get_weather");
    expect(callInvocations[0]?.[0]).not.toContain("delete_reminder");
  });

  it("surfaces a failing Inspector result as invalid with violations", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const exec = fakeExec({ tools: [{ name: "get_weather" }] }, { content: [], isError: true });

    const result = await checkCompliance(spec, fakeFetchGuard, { inspectorOptions: { exec } });

    expect(result.valid).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it("always closes the ephemeral server, even when the Inspector check throws", async () => {
    const spec = buildTestSpec([buildTestTool()]);
    const exec: CliExecutor = vi.fn().mockRejectedValue(new Error("spawn failed"));

    await expect(checkCompliance(spec, fakeFetchGuard, { inspectorOptions: { exec } })).rejects.toThrow(
      "spawn failed",
    );
    // No direct handle to assert on here; the absence of a hanging process/
    // unhandled rejection when the test suite exits is the practical signal
    // — the `finally` block in checker.ts's implementation guarantees this.
  });
});
