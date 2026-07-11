import { describe, expect, it } from "vitest";
import type { CliExecutor, CliInvocationResult } from "./inspector-runner.js";
import { inspectServer } from "./inspector-runner.js";

const URL = "http://localhost:3999/mcp";

function ok(stdout: unknown): CliInvocationResult {
  return { stdout: JSON.stringify(stdout), stderr: "", exitCode: 0 };
}

function connectionFailure(): CliInvocationResult {
  return { stdout: "", stderr: "Failed to connect to MCP server: fetch failed", exitCode: 1 };
}

/** Routes by whether the invocation args contain `tools/list` or `tools/call`. */
function makeExec(responses: {
  list?: CliInvocationResult;
  call?: (toolName: string) => CliInvocationResult;
}): CliExecutor {
  return async (args) => {
    if (args.includes("tools/list")) {
      return responses.list ?? ok({ tools: [] });
    }
    const nameIndex = args.indexOf("--tool-name");
    const toolName = nameIndex >= 0 ? args[nameIndex + 1] : "";
    return responses.call?.(toolName ?? "") ?? ok({ isError: false });
  };
}

describe("inspectServer", () => {
  it("passes when tools/list succeeds and no tool calls are requested", async () => {
    const exec = makeExec({ list: ok({ tools: [{ name: "echo", inputSchema: { type: "object" } }] }) });
    const result = await inspectServer(URL, { exec });
    expect(result).toEqual({ passed: true, failures: [] });
  });

  it("fails when the server is unreachable (non-zero exit code)", async () => {
    const exec = makeExec({ list: connectionFailure() });
    const result = await inspectServer(URL, { exec });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/connection failed \(exit 1\)/);
  });

  it("fails when tools/list returns non-JSON output", async () => {
    const exec = makeExec({ list: { stdout: "not json", stderr: "", exitCode: 0 } });
    const result = await inspectServer(URL, { exec });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/not valid JSON/);
  });

  it("fails when tools/list JSON does not match the MCP shape", async () => {
    const exec = makeExec({ list: ok({ notTools: [] }) });
    const result = await inspectServer(URL, { exec });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/shape validation/);
  });

  it("fails a requested tool call when the tool is absent from tools/list", async () => {
    const exec = makeExec({ list: ok({ tools: [] }) });
    const result = await inspectServer(URL, { exec, toolCalls: [{ name: "missing" }] });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/not present in tools\/list/);
  });

  it("passes a tool call whose response has no isError", async () => {
    const exec = makeExec({
      list: ok({ tools: [{ name: "echo" }] }),
      call: () => ok({ content: [{ type: "text", text: "echo: hi" }] }),
    });
    const result = await inspectServer(URL, { exec, toolCalls: [{ name: "echo", args: { text: "hi" } }] });
    expect(result).toEqual({ passed: true, failures: [] });
  });

  it("fails a tool call whose response has isError: true, even though exit code is 0 (spike finding)", async () => {
    const exec = makeExec({
      list: ok({ tools: [{ name: "echo" }] }),
      call: () => ok({ content: [{ type: "text", text: "MCP error -32602: Tool echo not found" }], isError: true }),
    });
    const result = await inspectServer(URL, { exec, toolCalls: [{ name: "echo" }] });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/isError: true/);
  });

  it("fails a tool call that hits a connection error", async () => {
    const exec = makeExec({
      list: ok({ tools: [{ name: "echo" }] }),
      call: () => connectionFailure(),
    });
    const result = await inspectServer(URL, { exec, toolCalls: [{ name: "echo" }] });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/connection failed \(exit 1\)/);
  });

  it("fails a tool call whose response is non-JSON", async () => {
    const exec = makeExec({
      list: ok({ tools: [{ name: "echo" }] }),
      call: () => ({ stdout: "not json", stderr: "", exitCode: 0 }),
    });
    const result = await inspectServer(URL, { exec, toolCalls: [{ name: "echo" }] });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/not valid JSON/);
  });

  it("fails a tool call whose response does not match the MCP shape", async () => {
    const exec = makeExec({
      list: ok({ tools: [{ name: "echo" }] }),
      call: () => ok({ isError: "not-a-boolean" }),
    });
    const result = await inspectServer(URL, { exec, toolCalls: [{ name: "echo" }] });
    expect(result.passed).toBe(false);
    expect(result.failures[0]).toMatch(/shape validation/);
  });

  it("aggregates failures across multiple tool calls without short-circuiting", async () => {
    const exec = makeExec({
      list: ok({ tools: [{ name: "a" }, { name: "b" }] }),
      call: (toolName) => (toolName === "a" ? ok({ isError: true }) : ok({ isError: false })),
    });
    const result = await inspectServer(URL, {
      exec,
      toolCalls: [{ name: "a" }, { name: "b" }],
    });
    expect(result.passed).toBe(false);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatch(/'a'/);
  });
});
