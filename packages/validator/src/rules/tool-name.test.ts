import { describe, expect, it } from "vitest";
import { makeValidSpec } from "../test-support.js";
import { checkToolNames } from "./tool-name.js";

describe("checkToolNames", () => {
  it("passes a spec with valid, unique tool names", () => {
    expect(checkToolNames(makeValidSpec())).toEqual([]);
  });

  it("flags a 0-length tool name", () => {
    const violations = checkToolNames(makeValidSpec({ toolOverrides: [{ name: "" }] }));
    expect(violations.some((v) => v.rule === "tool-name" && v.message.includes('""'))).toBe(true);
  });

  it("flags a 129-character tool name", () => {
    const longName = "a".repeat(129);
    const violations = checkToolNames(makeValidSpec({ toolOverrides: [{ name: longName }] }));
    expect(violations.some((v) => v.rule === "tool-name")).toBe(true);
  });

  it("passes a 128-character tool name (upper boundary)", () => {
    const boundaryName = "a".repeat(128);
    const violations = checkToolNames(makeValidSpec({ toolOverrides: [{ name: boundaryName }] }));
    expect(violations).toEqual([]);
  });

  it("flags a tool name containing Korean characters", () => {
    const violations = checkToolNames(makeValidSpec({ toolOverrides: [{ name: "날씨_조회" }] }));
    expect(violations.some((v) => v.rule === "tool-name")).toBe(true);
  });

  it("flags case-sensitive duplicate tool names", () => {
    const spec = makeValidSpec({
      toolOverrides: [{ name: "get_weather" }, { name: "get_weather" }],
    });
    const violations = checkToolNames(spec);
    expect(violations.some((v) => v.message.includes('duplicate tool name "get_weather"'))).toBe(true);
  });

  it("does not treat differently-cased names as duplicates", () => {
    const spec = makeValidSpec({
      toolOverrides: [{ name: "get_weather" }, { name: "Get_Weather" }],
    });
    expect(checkToolNames(spec)).toEqual([]);
  });
});
