import { describe, expect, it } from "vitest";
import type { ServerSpec } from "@mcp-foundry/spec";
import { makeValidSpec } from "../test-support.js";
import { checkAnnotations } from "./annotations.js";

// Zod's .regex()/required-field refinements are not reflected in the
// inferred ServerSpec TS type, so a hand-built value can still omit a
// required annotation key at runtime — these casts simulate exactly that
// to exercise the defense-in-depth check.
function withAnnotations(spec: ServerSpec, annotations: Record<string, unknown>): ServerSpec {
  return {
    ...spec,
    tools: [{ ...spec.tools[0]!, annotations } as ServerSpec["tools"][number], ...spec.tools.slice(1)],
  };
}

describe("checkAnnotations", () => {
  it("passes a spec with all 5 annotation fields present", () => {
    expect(checkAnnotations(makeValidSpec())).toEqual([]);
  });

  it.each(["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"])(
    "flags a missing %s annotation",
    (missingKey) => {
      const base = makeValidSpec();
      const { [missingKey]: _omitted, ...rest } = base.tools[0]!.annotations as unknown as Record<string, unknown>;
      const spec = withAnnotations(base, rest);
      const violations = checkAnnotations(spec);
      expect(violations.some((v) => v.message.includes(missingKey))).toBe(true);
    },
  );

  it("flags a missing title annotation", () => {
    const base = makeValidSpec();
    const { title: _omitted, ...rest } = base.tools[0]!.annotations as unknown as Record<string, unknown>;
    const violations = checkAnnotations(withAnnotations(base, rest));
    expect(violations.some((v) => v.message.includes('"title"'))).toBe(true);
  });
});
