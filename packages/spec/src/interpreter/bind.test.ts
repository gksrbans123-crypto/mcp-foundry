import { describe, expect, it } from "vitest";
import { toolSpecSchema } from "../schema/index.js";
import { buildRequestBody, buildRequestHeaders, buildRequestUrl, normalizeToolArgs } from "./bind.js";

const getTool = toolSpecSchema.parse({
  name: "get_thing",
  title: "Get thing",
  description: "Get a thing via MCP Foundry.",
  annotations: {
    title: "Get thing",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Id." } },
    required: ["id"],
    additionalProperties: false,
  },
  request: {
    method: "GET",
    urlTemplate: "https://api.example.com/v1/{id}/detail",
    headers: [{ name: "accept", value: "application/json" }],
    query: [{ key: "static_key", value: "fixed" }],
    body: null,
  },
  response: { fieldSelectors: [{ name: "x", path: "x" }], markdownTemplate: "{{x}}" },
});

const postTool = toolSpecSchema.parse({
  name: "search_things",
  title: "Search things",
  description: "Search things via MCP Foundry.",
  annotations: {
    title: "Search things",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: { query: { type: "string", description: "Query text." } },
    required: ["query"],
    additionalProperties: false,
  },
  request: {
    method: "POST",
    urlTemplate: "https://api.example.com/v1/search",
    headers: [],
    query: [],
    body: { contentType: "application/json", fields: [{ key: "q", param: "query" }] },
  },
  response: { fieldSelectors: [{ name: "x", path: "x" }], markdownTemplate: "{{x}}" },
});

describe("buildRequestUrl", () => {
  it("substitutes a declared path token", () => {
    const url = buildRequestUrl(getTool, { id: "abc123" });
    expect(url.toString()).toBe("https://api.example.com/v1/abc123/detail?static_key=fixed");
  });

  it("percent-encodes a path-traversal attempt instead of restructuring the URL", () => {
    const url = buildRequestUrl(getTool, { id: "../../etc/passwd" });
    expect(url.hostname).toBe("api.example.com");
    expect(url.pathname).toBe("/v1/..%2F..%2Fetc%2Fpasswd/detail");
  });

  it("percent-encodes an attempted host-injection value", () => {
    const url = buildRequestUrl(getTool, { id: "x/../../@evil.com" });
    expect(url.hostname).toBe("api.example.com");
  });
});

describe("buildRequestHeaders", () => {
  it("returns only the static allowlisted headers declared on the tool", () => {
    expect(buildRequestHeaders(getTool)).toEqual({ accept: "application/json" });
  });
});

describe("buildRequestBody", () => {
  it("returns undefined for a tool with no body mapping", () => {
    expect(buildRequestBody(getTool, { id: "abc" })).toBeUndefined();
  });

  it("builds a JSON body from param mappings", () => {
    const body = buildRequestBody(postTool, { query: "weather in seoul" });
    expect(JSON.parse(body as string)).toEqual({ q: "weather in seoul" });
  });
});

describe("normalizeToolArgs", () => {
  it("produces the same string regardless of key order", () => {
    const a = normalizeToolArgs({ b: 2, a: 1 });
    const b = normalizeToolArgs({ a: 1, b: 2 });
    expect(a).toBe(b);
  });

  it("produces different strings for different values", () => {
    expect(normalizeToolArgs({ a: 1 })).not.toBe(normalizeToolArgs({ a: 2 }));
  });
});
