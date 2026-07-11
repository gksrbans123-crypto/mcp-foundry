import { describe, expect, it, vi } from "vitest";
import type { FetchGuard } from "@mcp-foundry/spec";
import { buildTestSpec, buildTestTool } from "../test-support/fixtures.js";
import { probeSpec } from "./run-probe.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** Returns canned responses in order; the last one repeats once exhausted. */
function scriptedFetchGuard(responses: Array<() => Promise<Response>>): FetchGuard {
  let index = 0;
  return async () => {
    const next = responses[Math.min(index, responses.length - 1)]!;
    index += 1;
    return next();
  };
}

function neverResolvingFetchGuard(): FetchGuard {
  return (_url, request) =>
    new Promise((_resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(new Error("aborted")));
    });
}

const noopSleep = async () => {};

describe("probeSpec", () => {
  it("passes when every readOnly tool responds well under the latency gate", async () => {
    const tool = buildTestTool();
    const spec = buildTestSpec([tool]);
    const fetchGuard = scriptedFetchGuard([async () => jsonResponse({ temp: 20 })]);

    const outcome = await probeSpec(spec, { fetchGuard, sleep: noopSleep }, { sampleCount: 5 });

    expect(outcome.kind).toBe("passed");
    if (outcome.kind === "passed") {
      expect(outcome.result.sampleCount).toBe(5);
      expect(outcome.result.passed).toBe(true);
    }
  });

  it("never calls fetchGuard for a non-readOnly tool — dry-run schema check only (R1)", async () => {
    const mutatingTool = buildTestTool({
      name: "delete_reminder",
      annotations: {
        title: "Delete Reminder",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    });
    const spec = buildTestSpec([mutatingTool]);
    const fetchGuard = vi.fn();

    const outcome = await probeSpec(spec, { fetchGuard, sleep: noopSleep });

    expect(fetchGuard).not.toHaveBeenCalled();
    expect(outcome.kind).toBe("passed");
    if (outcome.kind === "passed") {
      expect(outcome.result.sampleCount).toBe(0); // nothing to measure for an all-mutating spec
    }
  });

  it("fails the gate when observed latency reaches the configured threshold (R2)", async () => {
    const tool = buildTestTool();
    const spec = buildTestSpec([tool]);
    const fetchGuard: FetchGuard = async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return jsonResponse({ temp: 20 });
    };

    const outcome = await probeSpec(
      spec,
      { fetchGuard, sleep: noopSleep },
      { sampleCount: 1, maxObservedLatencyMs: 10 },
    );

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.reason).toMatch(/exceeds the 10ms gate/);
      expect(outcome.result.passed).toBe(false);
    }
  });

  it("retries a transient 5xx and succeeds within the retry budget (R3)", async () => {
    const tool = buildTestTool();
    const spec = buildTestSpec([tool]);
    const fetchGuard = scriptedFetchGuard([
      async () => new Response(null, { status: 503 }),
      async () => new Response(null, { status: 503 }),
      async () => jsonResponse({ temp: 20 }),
    ]);

    const outcome = await probeSpec(
      spec,
      { fetchGuard, sleep: noopSleep },
      { sampleCount: 1, transientRetries: 3 },
    );

    expect(outcome.kind).toBe("passed");
  });

  it("reports a transient (retryable) outcome once retries are exhausted (R3)", async () => {
    const tool = buildTestTool();
    const spec = buildTestSpec([tool]);
    const fetchGuard: FetchGuard = async () => new Response(null, { status: 503 });

    const outcome = await probeSpec(
      spec,
      { fetchGuard, sleep: noopSleep },
      { sampleCount: 1, transientRetries: 2 },
    );

    expect(outcome.kind).toBe("transient");
  });

  it("classifies a request timeout as transient", async () => {
    const tool = buildTestTool();
    const spec = buildTestSpec([tool]);

    const outcome = await probeSpec(
      spec,
      { fetchGuard: neverResolvingFetchGuard(), sleep: noopSleep },
      { sampleCount: 1, transientRetries: 0, requestTimeoutMs: 20 },
    );

    expect(outcome.kind).toBe("transient");
  });

  it("treats a 4xx response as a completed (non-transient) sample", async () => {
    const tool = buildTestTool();
    const spec = buildTestSpec([tool]);
    const fetchGuard: FetchGuard = async () => new Response(null, { status: 404 });

    const outcome = await probeSpec(spec, { fetchGuard, sleep: noopSleep }, { sampleCount: 3 });

    expect(outcome.kind).toBe("passed");
  });
});
