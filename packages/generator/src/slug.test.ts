import { describe, expect, it } from "vitest";
import { toIdentifier, toSlug, toToolName } from "./slug.js";

describe("toSlug", () => {
  it("lowercases and hyphenates", () => {
    expect(toSlug("Weather Lookup Server")).toBe("weather-lookup-server");
  });

  it("strips leading/trailing hyphens", () => {
    expect(toSlug("  --Weather!!--  ")).toBe("weather");
  });

  it("falls back to a default when nothing sanitizable remains", () => {
    expect(toSlug("!!!")).toBe("generated-server");
  });
});

describe("toToolName", () => {
  it("builds a prefixed snake_case name", () => {
    expect(toToolName("Current Weather")).toBe("get_current_weather");
  });

  it("collapses repeated underscores", () => {
    expect(toToolName("!!Current---Weather!!")).toBe("get_current_weather");
  });
});

describe("toIdentifier", () => {
  it("camelCases a dotted/hyphenated field path segment", () => {
    expect(toIdentifier("temperature_2m_max")).toBe("temperature2mMax");
  });

  it("prefixes an identifier that would otherwise start with a digit", () => {
    expect(toIdentifier("2m_temp")).toBe("f2mTemp");
  });
});
