import { loadServerSpec, weatherFixture } from "@mcp-foundry/spec";
import { describe, expect, it } from "vitest";
import { makeValidSpec } from "./test-support.js";
import { validateSpec } from "./validate-spec.js";

describe("validateSpec", () => {
  it("passes a minimally valid spec", () => {
    expect(validateSpec(makeValidSpec())).toEqual({ valid: true, violations: [] });
  });

  it("aggregates violations across multiple rules instead of stopping at the first", () => {
    const result = validateSpec(makeValidSpec({ server: { name: "kakao server" }, toolCount: 2 }));
    expect(result.valid).toBe(false);
    const rulesHit = new Set(result.violations.map((v) => v.rule));
    expect(rulesHit.has("forbidden-word")).toBe(true);
    expect(rulesHit.has("tool-count")).toBe(true);
  });

  it("passes the weather fixture (packages/spec/fixtures/weather.json) once structurally loaded", () => {
    const loaded = loadServerSpec(weatherFixture);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const result = validateSpec(loaded.value);
    expect(result).toEqual({ valid: true, violations: [] });
  });
});
