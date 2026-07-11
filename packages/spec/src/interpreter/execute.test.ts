import { describe, expect, it } from "vitest";
import { toolSpecSchema } from "../schema/index.js";
import { executeTool } from "./execute.js";
import type { FetchGuard } from "./types.js";

const tool = toolSpecSchema.parse({
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
    type: "object",
    properties: {
      latitude: { type: "number", description: "Latitude." },
      longitude: { type: "number", description: "Longitude." },
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
      { key: "current", value: "temperature_2m" },
    ],
    body: null,
  },
  response: {
    fieldSelectors: [{ name: "temperature", path: "current.temperature_2m" }],
    markdownTemplate: "Temperature: {{temperature}}",
  },
  cacheTtlSeconds: 300,
});

function jsonFetchGuard(body: unknown, init: ResponseInit = {}): FetchGuard {
  return async () => new Response(JSON.stringify(body), { status: 200, ...init });
}

describe("executeTool", () => {
  it("returns rendered markdown on a successful call", async () => {
    const fetchGuard = jsonFetchGuard({ current: { temperature_2m: 21.4 } });
    const out = await executeTool(tool, { latitude: 52.52, longitude: 13.41 }, { fetchGuard });
    expect(out).toBe("Temperature: 21.4");
  });

  it("returns a sanitized markdown error and never calls fetchGuard for invalid parameters", async () => {
    let called = false;
    const fetchGuard: FetchGuard = async () => {
      called = true;
      return new Response("{}");
    };
    const out = await executeTool(tool, { latitude: "nope" }, { fetchGuard });
    expect(called).toBe(false);
    expect(out).toContain("**Error:**");
  });

  it("returns a markdown error for a non-ok upstream status without leaking the body", async () => {
    const fetchGuard: FetchGuard = async () => new Response("secret upstream error detail", { status: 500 });
    const out = await executeTool(tool, { latitude: 1, longitude: 2 }, { fetchGuard });
    expect(out).toContain("**Error:**");
    expect(out).not.toContain("secret upstream error detail");
  });

  it("returns a markdown error for a non-JSON upstream response", async () => {
    const fetchGuard: FetchGuard = async () => new Response("<html>not json</html>", { status: 200 });
    const out = await executeTool(tool, { latitude: 1, longitude: 2 }, { fetchGuard });
    expect(out).toContain("**Error:**");
  });

  it("returns a markdown error when the response exceeds the size cap", async () => {
    const fetchGuard = jsonFetchGuard({ current: { temperature_2m: 1 }, filler: "x".repeat(10_000) });
    const out = await executeTool(tool, { latitude: 1, longitude: 2 }, { fetchGuard, maxResponseBytes: 100 });
    expect(out).toContain("**Error:**");
  });

  it("returns a timeout markdown error when the upstream never responds in time", async () => {
    const fetchGuard: FetchGuard = (_url, request) =>
      new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    const out = await executeTool(tool, { latitude: 1, longitude: 2 }, { fetchGuard, timeoutMs: 5 });
    expect(out.toLowerCase()).toContain("timed out");
  });

  it("renders the missing-field placeholder when a selector path is absent from the response", async () => {
    const fetchGuard = jsonFetchGuard({ current: {} });
    const out = await executeTool(tool, { latitude: 1, longitude: 2 }, { fetchGuard });
    expect(out).toBe("Temperature: —");
  });
});
