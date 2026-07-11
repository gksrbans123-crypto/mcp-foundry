import { describe, expect, it } from "vitest";
import { buildTestDeps } from "../../test-support/deps.js";
import { buildTestJob, buildTestSpec, buildTestTool } from "../../test-support/fixtures.js";
import { runValidatingStage } from "./validating.js";

describe("runValidatingStage", () => {
  const spec = buildTestSpec([buildTestTool()]);

  it("fails when parsed_spec does not load structurally", async () => {
    const job = buildTestJob({ stage: "validating", parsedSpec: { not: "valid" } });
    const deps = buildTestDeps();

    const outcome = await runValidatingStage(job, deps);

    expect(outcome.kind).toBe("fail");
  });

  it("fails when static policy validation reports violations", async () => {
    const job = buildTestJob({ stage: "validating", parsedSpec: spec });
    const deps = buildTestDeps({
      validateSpec: () => ({ valid: false, violations: [{ rule: "forbidden-word", message: "contains kakao" }] }),
    });

    const outcome = await runValidatingStage(job, deps);

    expect(outcome.kind).toBe("fail");
    if (outcome.kind === "fail") {
      expect(outcome.error).toMatch(/forbidden-word/);
    }
  });

  it("retries when the compliance check throws an infrastructure error", async () => {
    const job = buildTestJob({ stage: "validating", parsedSpec: spec });
    const deps = buildTestDeps({
      validateSpec: () => ({ valid: true, violations: [] }),
      checkCompliance: async () => {
        throw new Error("npx spawn failed");
      },
    });

    const outcome = await runValidatingStage(job, deps);

    expect(outcome.kind).toBe("retry");
    if (outcome.kind === "retry") {
      expect(outcome.error).toMatch(/npx spawn failed/);
    }
  });

  it("fails when the compliance check returns a non-compliant result", async () => {
    const job = buildTestJob({ stage: "validating", parsedSpec: spec });
    const deps = buildTestDeps({
      validateSpec: () => ({ valid: true, violations: [] }),
      checkCompliance: async () => ({ valid: false, violations: [{ rule: "inspector", message: "bad tool call" }] }),
    });

    const outcome = await runValidatingStage(job, deps);

    expect(outcome.kind).toBe("fail");
    if (outcome.kind === "fail") {
      expect(outcome.error).toMatch(/inspector/);
    }
  });

  it("advances to probing when both checks pass", async () => {
    const job = buildTestJob({ stage: "validating", parsedSpec: spec });
    const deps = buildTestDeps({
      validateSpec: () => ({ valid: true, violations: [] }),
      checkCompliance: async () => ({ valid: true, violations: [] }),
    });

    const outcome = await runValidatingStage(job, deps);

    expect(outcome).toEqual({ kind: "advance", patch: { stage: "probing" } });
  });
});
