import { describe, expect, it } from "vitest";
import { toolSpecSchema } from "../schema/index.js";
import { validateToolArgs } from "./params.js";

const tool = toolSpecSchema.parse({
  name: "get_forecast",
  title: "Get forecast",
  description: "Get a forecast via MCP Foundry.",
  annotations: {
    title: "Get forecast",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      latitude: { type: "number", description: "Latitude." },
      longitude: { type: "number", description: "Longitude." },
      days: { type: "integer", description: "Forecast length.", enum: [1, 3, 5, 7] },
    },
    required: ["latitude", "longitude"],
    additionalProperties: false,
  },
  request: {
    method: "GET",
    urlTemplate: "https://api.open-meteo.com/v1/forecast",
    headers: [],
    query: [
      { key: "latitude", param: "latitude" },
      { key: "longitude", param: "longitude" },
    ],
    body: null,
  },
  response: {
    fieldSelectors: [{ name: "high", path: "daily.temperature_2m_max[0]" }],
    markdownTemplate: "{{high}}",
  },
});

describe("validateToolArgs", () => {
  it("accepts a valid argument object", () => {
    const result = validateToolArgs(tool, { latitude: 52.52, longitude: 13.41 });
    expect(result.ok).toBe(true);
  });

  it("accepts an optional enum-constrained parameter within range", () => {
    const result = validateToolArgs(tool, { latitude: 1, longitude: 2, days: 3 });
    expect(result.ok).toBe(true);
  });

  it("rejects an enum-constrained value outside the whitelist", () => {
    const result = validateToolArgs(tool, { latitude: 1, longitude: 2, days: 4 });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing required parameter", () => {
    const result = validateToolArgs(tool, { latitude: 1 });
    expect(result.ok).toBe(false);
  });

  it("rejects an unexpected/extra parameter (additionalProperties: false enforced at runtime)", () => {
    const result = validateToolArgs(tool, { latitude: 1, longitude: 2, injected: "$(rm -rf /)" });
    expect(result.ok).toBe(false);
  });

  it("rejects a wrong-typed value", () => {
    const result = validateToolArgs(tool, { latitude: "not a number", longitude: 2 });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(validateToolArgs(tool, "nope").ok).toBe(false);
    expect(validateToolArgs(tool, null).ok).toBe(false);
    expect(validateToolArgs(tool, [1, 2]).ok).toBe(false);
  });

  it("rejects an integer parameter given a non-integer number", () => {
    const result = validateToolArgs(tool, { latitude: 1, longitude: 2, days: 3.5 });
    expect(result.ok).toBe(false);
  });
});
