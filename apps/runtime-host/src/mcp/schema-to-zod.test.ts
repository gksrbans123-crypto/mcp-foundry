import type { ToolInputSchema } from "@mcp-foundry/spec";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { toZodShape } from "./schema-to-zod.js";

function objectFrom(inputSchema: ToolInputSchema) {
  return z.object(toZodShape(inputSchema));
}

describe("toZodShape", () => {
  it("builds a required string field", () => {
    const schema = objectFrom({
      type: "object",
      properties: { city: { type: "string", description: "City name." } },
      required: ["city"],
      additionalProperties: false,
    });
    expect(schema.safeParse({ city: "Seoul" }).success).toBe(true);
    expect(schema.safeParse({ city: 5 }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("builds an optional field that may be omitted", () => {
    const schema = objectFrom({
      type: "object",
      properties: { note: { type: "string", description: "Optional note." } },
      required: [],
      additionalProperties: false,
    });
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("builds a number field", () => {
    const schema = objectFrom({
      type: "object",
      properties: { latitude: { type: "number", description: "Lat." } },
      required: ["latitude"],
      additionalProperties: false,
    });
    expect(schema.safeParse({ latitude: 37.57 }).success).toBe(true);
    expect(schema.safeParse({ latitude: "37.57" }).success).toBe(false);
  });

  it("builds an integer field that rejects non-integers", () => {
    const schema = objectFrom({
      type: "object",
      properties: { days: { type: "integer", description: "Days." } },
      required: ["days"],
      additionalProperties: false,
    });
    expect(schema.safeParse({ days: 3 }).success).toBe(true);
    expect(schema.safeParse({ days: 3.5 }).success).toBe(false);
  });

  it("builds a boolean field", () => {
    const schema = objectFrom({
      type: "object",
      properties: { verbose: { type: "boolean", description: "Verbose." } },
      required: ["verbose"],
      additionalProperties: false,
    });
    expect(schema.safeParse({ verbose: true }).success).toBe(true);
    expect(schema.safeParse({ verbose: "true" }).success).toBe(false);
  });

  it("builds a string enum that only accepts whitelisted values", () => {
    const schema = objectFrom({
      type: "object",
      properties: { unit: { type: "string", description: "Unit.", enum: ["celsius", "fahrenheit"] } },
      required: ["unit"],
      additionalProperties: false,
    });
    expect(schema.safeParse({ unit: "celsius" }).success).toBe(true);
    expect(schema.safeParse({ unit: "kelvin" }).success).toBe(false);
  });

  it("builds an integer enum that only accepts whitelisted values", () => {
    const schema = objectFrom({
      type: "object",
      properties: { days: { type: "integer", description: "Days.", enum: [1, 3, 5, 7] } },
      required: ["days"],
      additionalProperties: false,
    });
    expect(schema.safeParse({ days: 3 }).success).toBe(true);
    expect(schema.safeParse({ days: 4 }).success).toBe(false);
  });

  it("builds a single-value enum without erroring", () => {
    const schema = objectFrom({
      type: "object",
      properties: { units: { type: "string", description: "Units.", enum: ["metric"] } },
      required: ["units"],
      additionalProperties: false,
    });
    expect(schema.safeParse({ units: "metric" }).success).toBe(true);
    expect(schema.safeParse({ units: "imperial" }).success).toBe(false);
  });
});
