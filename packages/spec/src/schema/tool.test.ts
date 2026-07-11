import { describe, expect, it } from "vitest";
import { toolSpecSchema } from "./tool.js";

function validTool() {
  return {
    name: "get_current_weather",
    title: "Get current weather",
    description: "Get current weather via MCP Foundry.",
    annotations: {
      title: "Get current weather",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object" as const,
      properties: {
        latitude: { type: "number" as const, description: "Latitude." },
        longitude: { type: "number" as const, description: "Longitude." },
      },
      required: ["latitude", "longitude"],
      additionalProperties: false as const,
    },
    request: {
      method: "GET" as const,
      urlTemplate: "https://api.open-meteo.com/v1/forecast",
      headers: [],
      query: [
        { key: "latitude", param: "latitude" },
        { key: "longitude", param: "longitude" },
        { key: "current", value: "temperature_2m" },
      ],
      body: null,
    },
    response: {
      fieldSelectors: [{ name: "temperature", path: "current.temperature_2m" }],
      markdownTemplate: "Temperature: {{temperature}}",
    },
  };
}

describe("toolSpecSchema", () => {
  it("accepts a well-formed tool", () => {
    const result = toolSpecSchema.safeParse(validTool());
    expect(result.success).toBe(true);
  });

  it("rejects a urlTemplate placeholder that references an undeclared parameter", () => {
    const tool = validTool();
    tool.request.urlTemplate = "https://api.open-meteo.com/v1/{ghost}/forecast";
    expect(toolSpecSchema.safeParse(tool).success).toBe(false);
  });

  it("rejects a query mapping that references an undeclared parameter", () => {
    const tool = validTool();
    tool.request.query = [{ key: "q", param: "ghost" }];
    expect(toolSpecSchema.safeParse(tool).success).toBe(false);
  });

  it("rejects a body field mapping that references an undeclared parameter", () => {
    const tool = validTool();
    tool.request = {
      method: "POST",
      urlTemplate: "https://api.example.com/v1/search",
      headers: [],
      query: [],
      body: { contentType: "application/json", fields: [{ key: "q", param: "ghost" }] },
    };
    expect(toolSpecSchema.safeParse(tool).success).toBe(false);
  });

  it("rejects cacheTtlSeconds on a non-readOnly tool", () => {
    const tool = validTool();
    tool.annotations = { ...tool.annotations, readOnlyHint: false };
    (tool as Record<string, unknown>).cacheTtlSeconds = 60;
    expect(toolSpecSchema.safeParse(tool).success).toBe(false);
  });

  it("accepts cacheTtlSeconds on a readOnly tool within the cap", () => {
    const tool = { ...validTool(), cacheTtlSeconds: 300 };
    expect(toolSpecSchema.safeParse(tool).success).toBe(true);
  });

  it("rejects cacheTtlSeconds above the 300s cap", () => {
    const tool = { ...validTool(), cacheTtlSeconds: 301 };
    expect(toolSpecSchema.safeParse(tool).success).toBe(false);
  });

  it("rejects an unknown top-level field (strict)", () => {
    const tool = { ...validTool(), extra: "not allowed" };
    expect(toolSpecSchema.safeParse(tool).success).toBe(false);
  });

  it("rejects a tool name outside the allowed pattern", () => {
    const tool = { ...validTool(), name: "not a valid name!" };
    expect(toolSpecSchema.safeParse(tool).success).toBe(false);
  });
});
