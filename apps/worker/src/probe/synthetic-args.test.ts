import { describe, expect, it } from "vitest";
import type { ToolInputSchema } from "@mcp-foundry/spec";
import { buildSyntheticArgs, buildSyntheticStringArgs, syntheticValueFor } from "./synthetic-args.js";

describe("syntheticValueFor", () => {
  it("prefers the first enum value when present", () => {
    expect(syntheticValueFor({ type: "string", description: "d", enum: ["b", "a"] })).toBe("b");
  });

  it.each([
    ["string", "test"],
    ["number", 1],
    ["integer", 1],
    ["boolean", false],
  ] as const)("defaults %s to %s", (type, expected) => {
    expect(syntheticValueFor({ type, description: "d" })).toBe(expected);
  });
});

describe("buildSyntheticArgs", () => {
  const inputSchema: ToolInputSchema = {
    type: "object",
    properties: {
      city: { type: "string", description: "d" },
      unit: { type: "string", description: "d", enum: ["c", "f"] },
      page: { type: "integer", description: "d" },
    },
    required: ["city", "unit"],
    additionalProperties: false,
  };

  it("fills only required parameters", () => {
    expect(buildSyntheticArgs(inputSchema)).toEqual({ city: "test", unit: "c" });
  });

  it("stringifies every value for the Inspector CLI variant", () => {
    expect(buildSyntheticStringArgs(inputSchema)).toEqual({ city: "test", unit: "c" });
  });
});
