import { serverSpecSchema, type ServerSpec } from "@mcp-foundry/spec";
import { describe, expect, it } from "vitest";
import { InMemorySpecRegistry } from "./memory-registry.js";

function fixtureSpec(slug: string): ServerSpec {
  return serverSpecSchema.parse({
    name: "Test Server",
    slug,
    description: "A test server.",
    mcpVersion: "2025-06-18",
    tools: [
      {
        name: "ping",
        title: "Ping",
        description: "Ping.",
        annotations: { title: "Ping", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
        inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false },
        request: { method: "GET", urlTemplate: "https://api.example.com/ping", headers: [], query: [], body: null },
        response: { fieldSelectors: [{ name: "x", path: "x" }], markdownTemplate: "{{x}}" },
      },
    ],
  });
}

describe("InMemorySpecRegistry", () => {
  it("returns null for a slug that was never registered", async () => {
    const registry = new InMemorySpecRegistry();
    expect(await registry.get("unknown")).toBeNull();
  });

  it("returns a previously set spec by slug", async () => {
    const registry = new InMemorySpecRegistry();
    const spec = fixtureSpec("weather-demo");
    await registry.set(spec);
    expect(await registry.get("weather-demo")).toEqual(spec);
  });

  it("keeps different slugs independent", async () => {
    const registry = new InMemorySpecRegistry();
    await registry.set(fixtureSpec("a"));
    await registry.set(fixtureSpec("b"));
    expect((await registry.get("a"))?.slug).toBe("a");
    expect((await registry.get("b"))?.slug).toBe("b");
  });

  it("overwrites an existing entry when set again with the same slug", async () => {
    const registry = new InMemorySpecRegistry();
    await registry.set(fixtureSpec("weather-demo"));
    const updated = { ...fixtureSpec("weather-demo"), description: "Updated description." };
    await registry.set(updated);
    expect((await registry.get("weather-demo"))?.description).toBe("Updated description.");
  });
});
