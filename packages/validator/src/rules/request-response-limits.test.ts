import { describe, expect, it } from "vitest";
import { makeValidSpec } from "../test-support.js";
import { checkRequestResponseLimits } from "./request-response-limits.js";

describe("checkRequestResponseLimits", () => {
  it("passes a spec with an https urlTemplate and a cacheTtlSeconds within the cap", () => {
    expect(checkRequestResponseLimits(makeValidSpec())).toEqual([]);
  });

  it("flags a non-https urlTemplate", () => {
    const violations = checkRequestResponseLimits(
      makeValidSpec({ toolOverrides: [{ request: { method: "GET", urlTemplate: "http://api.example.com/x", headers: [], query: [], body: null } }] }),
    );
    expect(violations.some((v) => v.rule === "request-response-limits" && v.message.includes("https"))).toBe(true);
  });

  it("flags a cacheTtlSeconds above the 300s cap", () => {
    const violations = checkRequestResponseLimits(makeValidSpec({ toolOverrides: [{ cacheTtlSeconds: 301 }] }));
    expect(violations.some((v) => v.message.includes("exceeds the 300s cap"))).toBe(true);
  });

  it("passes a cacheTtlSeconds exactly at the 300s cap", () => {
    expect(checkRequestResponseLimits(makeValidSpec({ toolOverrides: [{ cacheTtlSeconds: 300 }] }))).toEqual([]);
  });

  it("passes when cacheTtlSeconds is undefined", () => {
    expect(checkRequestResponseLimits(makeValidSpec({ toolOverrides: [{ cacheTtlSeconds: undefined }] }))).toEqual([]);
  });
});
