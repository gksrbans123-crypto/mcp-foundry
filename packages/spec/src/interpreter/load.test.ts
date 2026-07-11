import { describe, expect, it } from "vitest";
import { loadServerSpec } from "./load.js";

function validSpec() {
  return {
    name: "Weather Lookup",
    slug: "weather-lookup",
    description: "A weather lookup server via MCP Foundry.",
    mcpVersion: "2025-06-18",
    tools: [
      {
        name: "ping",
        title: "Ping",
        description: "Ping the upstream via MCP Foundry.",
        annotations: {
          title: "Ping",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
        inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
        request: { method: "GET", urlTemplate: "https://api.example.com/v1/ping", headers: [], query: [], body: null },
        response: { fieldSelectors: [{ name: "status", path: "status" }], markdownTemplate: "{{status}}" },
      },
    ],
  };
}

describe("loadServerSpec", () => {
  it("returns ok:true with a typed spec for valid input", () => {
    const result = loadServerSpec(validSpec());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.slug).toBe("weather-lookup");
    }
  });

  it("returns ok:false with readable errors for a malformed spec", () => {
    const result = loadServerSpec({ ...validSpec(), slug: "NOT-A-VALID-SLUG!" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("slug");
    }
  });

  it("rejects a completely malformed payload (not an object)", () => {
    const result = loadServerSpec("just a string");
    expect(result.ok).toBe(false);
  });

  it("rejects a spec attempting a scheme other than https (SSRF-adjacent injection attempt)", () => {
    const spec = validSpec();
    spec.tools[0].request.urlTemplate = "file:///etc/passwd";
    const result = loadServerSpec(spec);
    expect(result.ok).toBe(false);
  });
});
