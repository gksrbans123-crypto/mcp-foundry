import { executeTool, validateToolArgs, type FetchGuard, type ServerSpec, type ToolSpec } from "@mcp-foundry/spec";
import type { ProbeResult } from "@mcp-foundry/shared";
import { classifyProbeResult } from "./classify.js";
import { DEFAULT_PROBE_OPTIONS } from "./default-options.js";
import { buildSyntheticArgs } from "./synthetic-args.js";
import type { ProbeOptions, ProbeOutcome, ProbeRunnerDeps } from "./types.js";

type SampleOutcome =
  | { kind: "ok"; latencyMs: number }
  | { kind: "fatal"; error: string }
  | { kind: "exhausted"; error: string };

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOneSampleWithRetry(
  tool: ToolSpec,
  args: Record<string, unknown>,
  fetchGuard: FetchGuard,
  options: Required<ProbeOptions>,
  sleep: (ms: number) => Promise<void>,
): Promise<SampleOutcome> {
  let lastError = "";
  for (let attempt = 0; attempt <= options.transientRetries; attempt++) {
    const start = Date.now();
    const markdown = await executeTool(tool, args, { fetchGuard, timeoutMs: options.requestTimeoutMs });
    const latencyMs = Date.now() - start;
    const classification = classifyProbeResult(markdown);

    if (classification === "ok") return { kind: "ok", latencyMs };
    if (classification === "fatal") return { kind: "fatal", error: markdown };

    lastError = markdown;
    if (attempt < options.transientRetries) await sleep(options.retryBackoffMs * (attempt + 1));
  }
  return { kind: "exhausted", error: lastError };
}

interface ToolProbeResult {
  samples: number[];
  error?: { transient: boolean; message: string };
}

async function probeOneTool(
  tool: ToolSpec,
  deps: ProbeRunnerDeps,
  options: Required<ProbeOptions>,
): Promise<ToolProbeResult> {
  const args = buildSyntheticArgs(tool.inputSchema);
  const sleep = deps.sleep ?? defaultSleep;
  const samples: number[] = [];

  for (let i = 0; i < options.sampleCount; i++) {
    const outcome = await runOneSampleWithRetry(tool, args, deps.fetchGuard, options, sleep);
    if (outcome.kind === "fatal") {
      return { samples, error: { transient: false, message: `tool "${tool.name}": ${outcome.error}` } };
    }
    if (outcome.kind === "exhausted") {
      return {
        samples,
        error: {
          transient: true,
          message: `tool "${tool.name}": upstream unreachable after retries — ${outcome.error}`,
        },
      };
    }
    samples.push(outcome.latencyMs);
  }
  return { samples };
}

/** Non-readOnly tools never make a real call during probing (R1) — only a schema dry-run against synthetic args. */
function dryRunNonReadOnlyTool(tool: ToolSpec): string | null {
  const args = buildSyntheticArgs(tool.inputSchema);
  const validated = validateToolArgs(tool, args);
  return validated.ok ? null : `tool "${tool.name}" (non-readOnly, dry-run only): ${validated.errors.join("; ")}`;
}

function buildResult(samples: number[], options: Required<ProbeOptions>, complete: boolean): ProbeResult {
  const maxLatencyMs = samples.length > 0 ? Math.max(...samples) : 0;
  return {
    passed: complete && maxLatencyMs < options.maxObservedLatencyMs,
    measuredAtMs: Date.now(),
    maxLatencyMs,
    sampleCount: samples.length,
  };
}

/**
 * R1 safety invariant: only readOnly (probe-safe) tools are actually
 * invoked, and always via executeTool directly — never through a caching
 * layer — so every measurement is on the cold/uncached path by
 * construction. Non-readOnly tools get a schema dry-run only, never a real
 * network call, so probing itself can never cause an upstream side effect.
 *
 * A spec with zero readOnly tools vacuously passes (nothing to measure,
 * nothing exceeded the gate) — probing simply has no signal to give for an
 * all-mutating server.
 */
export async function probeSpec(
  spec: ServerSpec,
  deps: ProbeRunnerDeps,
  options: ProbeOptions = {},
): Promise<ProbeOutcome> {
  const resolved: Required<ProbeOptions> = { ...DEFAULT_PROBE_OPTIONS, ...options };

  for (const tool of spec.tools.filter((t) => !t.annotations.readOnlyHint)) {
    const dryRunError = dryRunNonReadOnlyTool(tool);
    if (dryRunError) return { kind: "failed", result: buildResult([], resolved, false), reason: dryRunError };
  }

  const allSamples: number[] = [];
  for (const tool of spec.tools.filter((t) => t.annotations.readOnlyHint)) {
    const toolResult = await probeOneTool(tool, deps, resolved);
    allSamples.push(...toolResult.samples);
    if (toolResult.error) {
      if (toolResult.error.transient) return { kind: "transient", reason: toolResult.error.message };
      return { kind: "failed", result: buildResult(allSamples, resolved, false), reason: toolResult.error.message };
    }
  }

  const result = buildResult(allSamples, resolved, true);
  if (!result.passed) {
    return {
      kind: "failed",
      result,
      reason: `observed max latency ${result.maxLatencyMs}ms exceeds the ${resolved.maxObservedLatencyMs}ms gate (R2)`,
    };
  }
  return { kind: "passed", result };
}
