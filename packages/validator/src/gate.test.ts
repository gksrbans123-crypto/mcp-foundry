import { describe, expect, it } from "vitest";
import type { CliExecutor, CliInvocationResult } from "./inspector-runner.js";
import { runInspectorCheck } from "./gate.js";

function ok(stdout: unknown): CliInvocationResult {
  return { stdout: JSON.stringify(stdout), stderr: "", exitCode: 0 };
}

describe("runInspectorCheck", () => {
  it("maps a passing inspectServer result to {valid: true, violations: []}", async () => {
    const exec: CliExecutor = async () => ok({ tools: [] });
    const result = await runInspectorCheck("http://localhost:3999/mcp", { exec });
    expect(result).toEqual({ valid: true, violations: [] });
  });

  it("maps a failing inspectServer result to {valid: false, violations: [{rule: 'inspector', ...}]}", async () => {
    const exec: CliExecutor = async () => ({
      stdout: "",
      stderr: "Failed to connect to MCP server: fetch failed",
      exitCode: 1,
    });
    const result = await runInspectorCheck("http://localhost:9999/mcp", { exec });
    expect(result.valid).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({ rule: "inspector" });
    expect(result.violations[0]?.message).toMatch(/connection failed/);
  });
});
