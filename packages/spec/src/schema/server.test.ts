import { describe, expect, it } from "vitest";
import { serverSpecSchema } from "./server.js";

function tool(name: string) {
  return {
    name,
    title: name,
    description: `Tool ${name} via MCP Foundry.`,
    annotations: {
      title: name,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
      additionalProperties: false as const,
    },
    request: {
      method: "GET" as const,
      urlTemplate: "https://api.example.com/v1/ping",
      headers: [],
      query: [],
      body: null,
    },
    response: {
      fieldSelectors: [{ name: "status", path: "status" }],
      markdownTemplate: "Status: {{status}}",
    },
  };
}

function baseServer() {
  return {
    name: "Weather Lookup",
    slug: "weather-lookup",
    description: "A weather lookup server via MCP Foundry.",
    mcpVersion: "2025-06-18",
    tools: [tool("ping")],
  };
}

describe("serverSpecSchema", () => {
  it("accepts a well-formed server spec", () => {
    expect(serverSpecSchema.safeParse(baseServer()).success).toBe(true);
  });

  it("rejects an mcpVersion before the supported minimum", () => {
    const spec = { ...baseServer(), mcpVersion: "2024-01-01" };
    expect(serverSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects an mcpVersion after the supported maximum", () => {
    const spec = { ...baseServer(), mcpVersion: "2026-01-01" };
    expect(serverSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects duplicate tool names", () => {
    const spec = { ...baseServer(), tools: [tool("ping"), tool("ping")] };
    expect(serverSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects an uppercase slug", () => {
    const spec = { ...baseServer(), slug: "Weather-Lookup" };
    expect(serverSpecSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects an empty tools array", () => {
    const spec = { ...baseServer(), tools: [] };
    expect(serverSpecSchema.safeParse(spec).success).toBe(false);
  });
});
