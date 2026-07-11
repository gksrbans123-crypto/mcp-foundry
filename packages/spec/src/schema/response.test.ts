import { describe, expect, it } from "vitest";
import { responseSchema } from "./response.js";

function base() {
  return {
    fieldSelectors: [{ name: "temperature", path: "current.temperature_2m" }],
    markdownTemplate: "Temperature: {{temperature}}",
  };
}

describe("responseSchema", () => {
  it("accepts a template that only substitutes declared fields", () => {
    expect(responseSchema.safeParse(base()).success).toBe(true);
  });

  it("accepts an array-indexed field path", () => {
    const spec = {
      fieldSelectors: [{ name: "firstDay", path: "daily.temperature_2m_max[0]" }],
      markdownTemplate: "High: {{firstDay}}",
    };
    expect(responseSchema.safeParse(spec).success).toBe(true);
  });

  it("accepts a root-level array-indexed field path", () => {
    const spec = {
      fieldSelectors: [{ name: "secondTemp", path: "[1].current.temperature_2m" }],
      markdownTemplate: "{{secondTemp}}",
    };
    expect(responseSchema.safeParse(spec).success).toBe(true);
  });

  it("rejects a markdownTemplate referencing an undeclared field", () => {
    const spec = { ...base(), markdownTemplate: "{{temperature}} and {{ghost}}" };
    expect(responseSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects duplicate field selector names", () => {
    const spec = {
      fieldSelectors: [
        { name: "temperature", path: "current.temperature_2m" },
        { name: "temperature", path: "current.wind_speed_10m" },
      ],
      markdownTemplate: "{{temperature}}",
    };
    expect(responseSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a malformed field path", () => {
    const spec = {
      fieldSelectors: [{ name: "bad", path: "current..temperature" }],
      markdownTemplate: "{{bad}}",
    };
    expect(responseSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects an empty fieldSelectors array", () => {
    const spec = { fieldSelectors: [], markdownTemplate: "no fields" };
    expect(responseSchema.safeParse(spec).success).toBe(false);
  });
});
