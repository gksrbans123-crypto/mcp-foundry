import { describe, expect, it } from "vitest";
import { finalizeSpec } from "./finalize.js";
import { weatherTemplate } from "./templates/weather.js";

describe("finalizeSpec", () => {
  it("accepts a valid spec", () => {
    const result = finalizeSpec(weatherTemplate.buildSpec());
    expect(result.rejected).toBe(false);
  });

  it("rejects with a reason when the spec fails structural (zod) validation", () => {
    const broken = { ...weatherTemplate.buildSpec(), tools: [] };
    const result = finalizeSpec(broken);
    expect(result.rejected).toBe(true);
    if (!result.rejected) return;
    expect(result.reason).toMatch(/structural validation/);
  });

  it("rejects with a reason when the spec fails business-policy validation", () => {
    const base = weatherTemplate.buildSpec();
    const withForbiddenWord = { ...base, name: "kakao weather" };
    const result = finalizeSpec(withForbiddenWord);
    expect(result.rejected).toBe(true);
    if (!result.rejected) return;
    expect(result.reason).toMatch(/policy validation/);
    expect(result.reason).toMatch(/forbidden-word/);
  });
});
