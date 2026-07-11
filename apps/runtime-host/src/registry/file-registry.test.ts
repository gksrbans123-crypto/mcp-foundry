import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { serverSpecSchema, type ServerSpec } from "@mcp-foundry/spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileSpecRegistry } from "./file-registry.js";

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

describe("FileSpecRegistry", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "spec-registry-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns null for a slug with no file on disk", async () => {
    const registry = new FileSpecRegistry(dir);
    expect(await registry.get("missing")).toBeNull();
  });

  it("round-trips a spec written via set()", async () => {
    const registry = new FileSpecRegistry(dir);
    const spec = fixtureSpec("weather-demo");
    await registry.set(spec);
    expect(await registry.get("weather-demo")).toEqual(spec);
  });

  it("creates the directory on first write if it does not exist yet", async () => {
    const nestedDir = path.join(dir, "nested", "specs");
    const registry = new FileSpecRegistry(nestedDir);
    await registry.set(fixtureSpec("weather-demo"));
    expect(await registry.get("weather-demo")).not.toBeNull();
  });

  it("returns null (never throws) for a file containing invalid JSON", async () => {
    await writeFile(path.join(dir, "broken.json"), "{ not valid json", "utf8");
    const registry = new FileSpecRegistry(dir);
    expect(await registry.get("broken")).toBeNull();
  });

  it("returns null (never throws) for a file that is valid JSON but fails spec validation", async () => {
    await writeFile(path.join(dir, "invalid-spec.json"), JSON.stringify({ not: "a valid spec" }), "utf8");
    const registry = new FileSpecRegistry(dir);
    expect(await registry.get("invalid-spec")).toBeNull();
  });
});
