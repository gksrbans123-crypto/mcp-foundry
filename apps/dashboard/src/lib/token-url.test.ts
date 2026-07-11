import { describe, expect, it } from "vitest";
import { buildUrlWithoutToken } from "./token-url";

describe("buildUrlWithoutToken", () => {
  it("removes the token param, leaving a bare pathname when it was the only param", () => {
    expect(buildUrlWithoutToken("/servers", "token=abc.def")).toBe("/servers");
  });

  it("preserves other query params when removing the token", () => {
    expect(buildUrlWithoutToken("/servers", "token=abc.def&status=active")).toBe("/servers?status=active");
  });

  it("is a no-op when there is no token param", () => {
    expect(buildUrlWithoutToken("/servers", "status=active")).toBe("/servers?status=active");
  });

  it("returns the bare pathname for an empty search string", () => {
    expect(buildUrlWithoutToken("/servers", "")).toBe("/servers");
  });

  it("never leaves the raw token value anywhere in the result", () => {
    const token = "super-secret-owner-token-value";
    const result = buildUrlWithoutToken("/jobs/job-1", `token=${token}&demo=1`);
    expect(result).not.toContain(token);
  });
});
