import { describe, expect, it } from "vitest";
import { makeValidSpec } from "../test-support.js";
import { checkToolCount } from "./tool-count.js";

describe("checkToolCount", () => {
  it("flags 2 tools as below the recommended minimum, with an auto-augment hint", () => {
    const violations = checkToolCount(makeValidSpec({ toolCount: 2 }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "tool-count" });
    expect(violations[0]?.hint).toMatch(/auto-augment/);
  });

  it("passes at exactly 3 tools", () => {
    expect(checkToolCount(makeValidSpec({ toolCount: 3 }))).toEqual([]);
  });

  it("passes at exactly 10 tools", () => {
    expect(checkToolCount(makeValidSpec({ toolCount: 10 }))).toEqual([]);
  });

  it("passes at exactly 20 tools (tolerated but not recommended)", () => {
    expect(checkToolCount(makeValidSpec({ toolCount: 20 }))).toEqual([]);
  });

  it("flags 21 tools as exceeding the hard cap", () => {
    const violations = checkToolCount(makeValidSpec({ toolCount: 21 }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "tool-count" });
    expect(violations[0]?.hint).toBeUndefined();
  });
});
