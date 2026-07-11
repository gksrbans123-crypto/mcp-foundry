import { SERVICE_NAME } from "@mcp-foundry/shared";
import { describe, expect, it } from "vitest";
import { makeValidSpec } from "../test-support.js";
import { checkDescriptions } from "./description.js";

describe("checkDescriptions", () => {
  it("passes a spec whose descriptions mention SERVICE_NAME and stay in English", () => {
    expect(checkDescriptions(makeValidSpec())).toEqual([]);
  });

  it("flags a 1025-character server description", () => {
    const longDescription = `${SERVICE_NAME} ${"a".repeat(1025 - SERVICE_NAME.length - 1)}`;
    expect(longDescription.length).toBe(1025);
    const violations = checkDescriptions(makeValidSpec({ server: { description: longDescription } }));
    expect(violations.some((v) => v.message.includes("exceeding the 1024-character limit"))).toBe(true);
  });

  it("passes a 1024-character server description (upper boundary)", () => {
    const boundaryDescription = `${SERVICE_NAME} ${"a".repeat(1024 - SERVICE_NAME.length - 1)}`;
    expect(boundaryDescription.length).toBe(1024);
    const violations = checkDescriptions(makeValidSpec({ server: { description: boundaryDescription } }));
    expect(violations.some((v) => v.message.includes("exceeding"))).toBe(false);
  });

  it("flags a server description missing SERVICE_NAME", () => {
    const violations = checkDescriptions(makeValidSpec({ server: { description: "A widget lookup server." } }));
    expect(violations.some((v) => v.message.includes(`must mention "${SERVICE_NAME}"`))).toBe(true);
  });

  it("flags a tool description missing SERVICE_NAME", () => {
    const violations = checkDescriptions(makeValidSpec({ toolOverrides: [{ description: "Looks up a widget." }] }));
    expect(violations.some((v) => v.message.includes("tools[0].description") && v.message.includes("must mention"))).toBe(
      true,
    );
  });

  it("flags a description that is mostly non-English after stripping SERVICE_NAME", () => {
    const violations = checkDescriptions(
      makeValidSpec({ server: { description: `${SERVICE_NAME} 위젯을 조회하는 서버입니다 매우 유용한 도구입니다` } }),
    );
    const languageViolation = violations.find((v) => v.message.includes("primarily English"));
    expect(languageViolation).toBeDefined();
    expect(languageViolation?.hint).toMatch(/English/);
  });
});
