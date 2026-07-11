import type { FetchGuard } from "@mcp-foundry/spec";
import type { ProbeResult } from "@mcp-foundry/shared";

export interface ProbeOptions {
  /** R2: number of samples per readOnly tool. */
  sampleCount?: number;
  /** R2: hard gate — observed max latency must be strictly below this. */
  maxObservedLatencyMs?: number;
  /** Plan §5.3: per-request upstream timeout. */
  requestTimeoutMs?: number;
  /** R3: retry attempts for a transient (connection/5xx/timeout) failure before it counts as exhausted. */
  transientRetries?: number;
  /** Base backoff between retries in ms; attempt N waits `retryBackoffMs * N`. */
  retryBackoffMs?: number;
}

export interface ProbeRunnerDeps {
  fetchGuard: FetchGuard;
  /** Injectable so tests don't wait through real backoff delays. */
  sleep?: (ms: number) => Promise<void>;
}

export type ProbeOutcome =
  | { kind: "passed"; result: ProbeResult }
  | { kind: "failed"; result: ProbeResult; reason: string }
  | { kind: "transient"; reason: string };
