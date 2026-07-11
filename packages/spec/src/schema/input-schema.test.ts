import { describe, expect, it } from "vitest";
import { toolInputSchemaSchema } from "./input-schema.js";

function base() {
  return {
    type: "object" as const,
    properties: {
      latitude: { type: "number" as const, description: "Latitude in decimal degrees." },
    },
    required: ["latitude"],
    additionalProperties: false as const,
  };
}

describe("toolInputSchemaSchema", () => {
  it("accepts a well-formed flat schema", () => {
    expect(toolInputSchemaSchema.safeParse(base()).success).toBe(true);
  });

  it("rejects a required name that is not declared in properties", () => {
    const spec = { ...base(), required: ["latitude", "ghost"] };
    expect(toolInputSchemaSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects additionalProperties: true (must be literal false)", () => {
    const spec = { ...base(), additionalProperties: true };
    expect(toolInputSchemaSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a nested object property (only flat leaves allowed)", () => {
    const spec = {
      ...base(),
      properties: {
        ...base().properties,
        nested: { type: "object", description: "not allowed" },
      },
    };
    expect(toolInputSchemaSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects an unknown top-level field (strict)", () => {
    const spec = { ...base(), $ref: "#/definitions/evil" };
    expect(toolInputSchemaSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a property name that is not a valid identifier", () => {
    const spec = {
      ...base(),
      properties: { "bad-name!": { type: "string", description: "x" } },
      required: [],
    };
    expect(toolInputSchemaSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects an enum with number entries on a string-typed property", () => {
    const spec = {
      ...base(),
      properties: { latitude: { type: "string", description: "x", enum: [1, 2] } },
    };
    expect(toolInputSchemaSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects an enum with string entries on a number-typed property", () => {
    const spec = {
      ...base(),
      properties: { latitude: { type: "number", description: "x", enum: ["a", "b"] } },
    };
    expect(toolInputSchemaSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a non-integer enum entry on an integer-typed property", () => {
    const spec = {
      ...base(),
      properties: { days: { type: "integer", description: "x", enum: [1, 3.5] } },
      required: [],
    };
    expect(toolInputSchemaSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects an enum on a boolean-typed property", () => {
    const spec = {
      ...base(),
      properties: { flag: { type: "boolean", description: "x", enum: [true] as unknown as (string | number)[] } },
      required: [],
    };
    expect(toolInputSchemaSchema.safeParse(spec).success).toBe(false);
  });

  it("accepts a matching-type enum on a string property", () => {
    const spec = {
      ...base(),
      properties: { unit: { type: "string", description: "x", enum: ["celsius", "fahrenheit"] } },
      required: [],
    };
    expect(toolInputSchemaSchema.safeParse(spec).success).toBe(true);
  });

  it("accepts a matching-type enum on an integer property", () => {
    const spec = {
      ...base(),
      properties: { days: { type: "integer", description: "x", enum: [1, 3, 5, 7] } },
      required: [],
    };
    expect(toolInputSchemaSchema.safeParse(spec).success).toBe(true);
  });
});
