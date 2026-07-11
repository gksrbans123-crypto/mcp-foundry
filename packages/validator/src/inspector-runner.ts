// MCP standard compliance runner: shells out to the MCP Inspector CLI in headless
// (`--cli`) mode against a live server URL. See docs/inspector-spike.md for the spike
// that established this is viable and for the exit-code semantics documented below.
import { execFile as execFileCb } from "node:child_process";
import { z } from "zod";

/** Pinned exactly; bump only with a re-run of the spike in docs/inspector-spike.md. */
export const INSPECTOR_PACKAGE = "@modelcontextprotocol/inspector@0.22.0";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export interface ToolCallSpec {
  /** Tool name to invoke via `tools/call`. Callers must only pass readOnly, probe-safe tools (plan R1) — this runner does not filter by annotation itself. */
  name: string;
  /** Simple key=value tool arguments (Inspector CLI `--tool-arg` format). */
  args?: Record<string, string>;
}

export interface InspectorRunnerResult {
  passed: boolean;
  failures: string[];
}

export interface CliInvocationResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** Runs one Inspector CLI invocation. Injectable for tests; never throws. */
export type CliExecutor = (args: string[], timeoutMs: number) => Promise<CliInvocationResult>;

export interface InspectorRunnerOptions {
  toolCalls?: ToolCallSpec[];
  inspectorPackage?: string;
  timeoutMs?: number;
  exec?: CliExecutor;
}

const toolsListResponseSchema = z.object({
  tools: z.array(
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      inputSchema: z.record(z.string(), z.unknown()).optional(),
      annotations: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

const toolCallResponseSchema = z.object({
  content: z.unknown().optional(),
  isError: z.boolean().optional(),
});

/**
 * Default executor: spawns `npx --yes <inspectorPackage> ...` and normalizes the result.
 *
 * IMPORTANT (empirically verified, see docs/inspector-spike.md): the Inspector CLI exits
 * 0 for a `tools/call` whose response body has `isError: true` (e.g. unknown tool name) —
 * only transport-level failures (unreachable server, timeout) produce a non-zero exit
 * code. Callers of this module must inspect the parsed JSON, not just the exit code.
 */
export const defaultCliExecutor: CliExecutor = (args, timeoutMs) =>
  new Promise((resolve) => {
    execFileCb(
      "npx",
      ["--yes", ...args],
      { encoding: "utf-8", timeout: timeoutMs, maxBuffer: MAX_BUFFER_BYTES },
      (error, stdout, stderr) => {
        if (error) {
          const err = error as NodeJS.ErrnoException & { code?: number | string };
          resolve({
            stdout: typeof stdout === "string" ? stdout : "",
            stderr: typeof stderr === "string" && stderr.length > 0 ? stderr : String(err.message ?? err),
            exitCode: typeof err.code === "number" ? err.code : 1,
          });
          return;
        }
        resolve({ stdout: stdout ?? "", stderr: stderr ?? "", exitCode: 0 });
      },
    );
  });

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function toolArgsToFlags(args: Record<string, string> | undefined): string[] {
  if (!args) return [];
  return Object.entries(args).flatMap(([key, value]) => ["--tool-arg", `${key}=${value}`]);
}

function buildArgs(inspectorPackage: string, url: string, method: string, extra: string[] = []): string[] {
  return [inspectorPackage, "--cli", url, "--transport", "http", "--method", method, ...extra];
}

async function runToolsList(
  exec: CliExecutor,
  url: string,
  inspectorPackage: string,
  timeoutMs: number,
): Promise<{ failures: string[]; toolNames: Set<string> }> {
  const result = await exec(buildArgs(inspectorPackage, url, "tools/list"), timeoutMs);
  if (result.exitCode !== 0) {
    return {
      failures: [`tools/list: connection failed (exit ${result.exitCode}): ${result.stderr.trim()}`],
      toolNames: new Set(),
    };
  }

  const json = parseJson(result.stdout);
  if (!json.ok) {
    return { failures: ["tools/list: response was not valid JSON"], toolNames: new Set() };
  }

  const parsed = toolsListResponseSchema.safeParse(json.value);
  if (!parsed.success) {
    return {
      failures: [`tools/list: response failed MCP shape validation: ${parsed.error.message}`],
      toolNames: new Set(),
    };
  }

  return { failures: [], toolNames: new Set(parsed.data.tools.map((tool) => tool.name)) };
}

async function runToolCall(
  exec: CliExecutor,
  url: string,
  inspectorPackage: string,
  timeoutMs: number,
  call: ToolCallSpec,
): Promise<string[]> {
  const args = buildArgs(inspectorPackage, url, "tools/call", [
    "--tool-name",
    call.name,
    ...toolArgsToFlags(call.args),
  ]);
  const result = await exec(args, timeoutMs);
  if (result.exitCode !== 0) {
    return [`tools/call '${call.name}': connection failed (exit ${result.exitCode}): ${result.stderr.trim()}`];
  }

  const json = parseJson(result.stdout);
  if (!json.ok) {
    return [`tools/call '${call.name}': response was not valid JSON`];
  }

  const parsed = toolCallResponseSchema.safeParse(json.value);
  if (!parsed.success) {
    return [`tools/call '${call.name}': response failed MCP shape validation: ${parsed.error.message}`];
  }

  return parsed.data.isError ? [`tools/call '${call.name}': returned isError: true`] : [];
}

/**
 * Runs an MCP standard compliance check against a live server URL: `tools/list` shape
 * validation, plus an optional `tools/call` round trip for each caller-supplied spec.
 */
export async function inspectServer(
  url: string,
  options: InspectorRunnerOptions = {},
): Promise<InspectorRunnerResult> {
  const inspectorPackage = options.inspectorPackage ?? INSPECTOR_PACKAGE;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const exec = options.exec ?? defaultCliExecutor;

  const listOutcome = await runToolsList(exec, url, inspectorPackage, timeoutMs);
  if (listOutcome.failures.length > 0) {
    return { passed: false, failures: listOutcome.failures };
  }

  const failures: string[] = [];
  for (const call of options.toolCalls ?? []) {
    if (!listOutcome.toolNames.has(call.name)) {
      failures.push(`tools/call '${call.name}': tool not present in tools/list response`);
      continue;
    }
    failures.push(...(await runToolCall(exec, url, inspectorPackage, timeoutMs, call)));
  }

  return { passed: failures.length === 0, failures };
}
