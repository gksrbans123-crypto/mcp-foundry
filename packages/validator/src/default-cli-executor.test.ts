import { describe, expect, it, vi } from "vitest";

type ExecFileCallback = (
  error: (Error & { code?: number; stdout?: string; stderr?: string }) | null,
  stdout: string,
  stderr: string,
) => void;

const execFileMock = vi.fn<
  (file: string, args: string[], options: unknown, callback: ExecFileCallback) => void
>();

vi.mock("node:child_process", () => ({
  execFile: (...args: Parameters<typeof execFileMock>) => execFileMock(...args),
}));

const { defaultCliExecutor } = await import("./inspector-runner.js");

describe("defaultCliExecutor", () => {
  it("resolves exitCode 0 with stdout/stderr on success", async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      callback(null, '{"tools":[]}', "");
    });

    const result = await defaultCliExecutor(["@modelcontextprotocol/inspector@0.22.0"], 1000);

    expect(result).toEqual({ stdout: '{"tools":[]}', stderr: "", exitCode: 0 });
    expect(execFileMock).toHaveBeenCalledWith(
      "npx",
      ["--yes", "@modelcontextprotocol/inspector@0.22.0"],
      expect.objectContaining({ timeout: 1000 }),
      expect.any(Function),
    );
  });

  it("normalizes a non-zero exit into a result instead of throwing", async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      const error = Object.assign(new Error("Command failed"), { code: 1 });
      callback(error, "", "Failed to connect to MCP server: fetch failed");
    });

    const result = await defaultCliExecutor(["@modelcontextprotocol/inspector@0.22.0"], 1000);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/fetch failed/);
  });

  it("falls back to the error message when stderr is empty", async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) => {
      const error = Object.assign(new Error("spawn npx ENOENT"), {});
      callback(error, "", "");
    });

    const result = await defaultCliExecutor(["@modelcontextprotocol/inspector@0.22.0"], 1000);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/spawn npx ENOENT/);
  });
});
