import type { ProbeOptions } from "./types.js";

export const DEFAULT_PROBE_OPTIONS: Required<ProbeOptions> = {
  sampleCount: 20,
  maxObservedLatencyMs: 2000,
  requestTimeoutMs: 2500,
  transientRetries: 3,
  retryBackoffMs: 200,
};
