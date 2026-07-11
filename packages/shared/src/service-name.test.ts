import { describe, expect, it } from "vitest";
import { SERVICE_NAME } from "./service-name.js";

describe("SERVICE_NAME", () => {
  it("does not contain the forbidden 'kakao' substring, case-insensitively", () => {
    expect(SERVICE_NAME.toLowerCase()).not.toContain("kakao");
  });

  it("bilingually pairs an English and a Korean form", () => {
    expect(SERVICE_NAME).toMatch(/[A-Za-z]/);
    expect(SERVICE_NAME).toMatch(/[가-힣]/);
  });
});
