import { describe, expect, it } from "vitest";
import { makeValidSpec } from "../test-support.js";
import { checkForbiddenWords } from "./forbidden-word.js";

describe("checkForbiddenWords", () => {
  it("passes a spec with no forbidden substrings", () => {
    expect(checkForbiddenWords(makeValidSpec())).toEqual([]);
  });

  it.each([
    ["exact lowercase match", "kakao"],
    ["mixed case match", "KaKao"],
    ["uppercase match", "KAKAO"],
    ["substring match", "xkakaox"],
  ])("flags %s in the server name", (_label, value) => {
    const violations = checkForbiddenWords(makeValidSpec({ server: { name: value } }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "forbidden-word" });
    expect(violations[0]?.message).toContain("server name");
  });

  it("flags kakao in the slug", () => {
    const violations = checkForbiddenWords(makeValidSpec({ server: { slug: "xkakaox" } }));
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("server slug");
  });

  it("flags kakao in the server description", () => {
    const violations = checkForbiddenWords(makeValidSpec({ server: { description: "Uses the kakao platform." } }));
    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("server description");
  });

  it("flags kakao in a tool name", () => {
    const violations = checkForbiddenWords(makeValidSpec({ toolOverrides: [{ name: "kakao_lookup" }] }));
    expect(violations.some((v) => v.message.includes("tools[0].name"))).toBe(true);
  });

  it("flags kakao in a tool title", () => {
    const violations = checkForbiddenWords(makeValidSpec({ toolOverrides: [{ title: "KaKao lookup" }] }));
    expect(violations.some((v) => v.message.includes("tools[0].title"))).toBe(true);
  });

  it("flags kakao in a tool description", () => {
    const violations = checkForbiddenWords(makeValidSpec({ toolOverrides: [{ description: "Looks up KAKAO data." }] }));
    expect(violations.some((v) => v.message.includes("tools[0].description"))).toBe(true);
  });

  it("flags kakao in a tool annotations.title", () => {
    const violations = checkForbiddenWords(
      makeValidSpec({
        toolOverrides: [{ annotations: { ...makeValidSpec().tools[0]!.annotations, title: "kakao" } }],
      }),
    );
    expect(violations.some((v) => v.message.includes("tools[0].annotations.title"))).toBe(true);
  });

  it("does not flag unrelated substrings like 'cacao'", () => {
    expect(checkForbiddenWords(makeValidSpec({ server: { description: "A cacao-flavored recipe finder." } }))).toEqual([]);
  });
});
