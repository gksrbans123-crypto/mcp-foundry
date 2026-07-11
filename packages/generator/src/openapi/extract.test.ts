import { describe, expect, it } from "vitest";
import { extractEndpointFromOpenApi } from "./extract.js";

const VALID_DOC = {
  servers: [{ url: "https://api.example.com" }],
  paths: {
    "/widgets/{id}": {
      get: {
        summary: "Get a widget by id",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" }, description: "Widget id." },
          { name: "verbose", in: "query", required: false, schema: { type: "boolean" }, description: "Verbose output." },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  properties: {
                    name: { type: "string" },
                    price_usd: { type: "number" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

describe("extractEndpointFromOpenApi", () => {
  it("extracts a GET endpoint's params and response field hints", () => {
    const descriptor = extractEndpointFromOpenApi(VALID_DOC);
    expect(descriptor).not.toBeNull();
    expect(descriptor?.method).toBe("GET");
    expect(descriptor?.url).toBe("https://api.example.com/widgets/{id}");
    expect(descriptor?.params).toEqual([
      { name: "id", type: "string", description: "Widget id.", in: "path", required: true },
      { name: "verbose", type: "boolean", description: "Verbose output.", in: "query", required: false },
    ]);
    expect(descriptor?.responseFieldHints).toEqual([
      { name: "name", path: "name" },
      { name: "priceUsd", path: "price_usd" },
    ]);
    expect(descriptor?.summary).toBe("Get a widget by id");
  });

  it("filters by pathContains hint", () => {
    const descriptor = extractEndpointFromOpenApi(VALID_DOC, { pathContains: "nope" });
    expect(descriptor).toBeNull();
  });

  it("returns null when the document fails structural validation", () => {
    expect(extractEndpointFromOpenApi({ not: "a doc" })).toBeNull();
  });

  it("returns null when there is no server URL", () => {
    const doc = { paths: VALID_DOC.paths };
    expect(extractEndpointFromOpenApi(doc)).toBeNull();
  });

  it("returns null when the server URL is not https", () => {
    const doc = { servers: [{ url: "http://api.example.com" }], paths: VALID_DOC.paths };
    expect(extractEndpointFromOpenApi(doc)).toBeNull();
  });

  it("skips an operation whose parameter type is unsupported (e.g. array)", () => {
    const doc = {
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/search": {
          get: {
            summary: "Search",
            parameters: [{ name: "tags", in: "query", schema: { type: "array" } }],
            responses: { "200": { content: { "application/json": { schema: { properties: { hits: { type: "number" } } } } } } },
          },
        },
      },
    };
    expect(extractEndpointFromOpenApi(doc)).toBeNull();
  });

  it("skips an operation with no usable response schema", () => {
    const doc = {
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/ping": {
          get: { summary: "Ping", responses: { "200": {} } },
        },
      },
    };
    expect(extractEndpointFromOpenApi(doc)).toBeNull();
  });

  it("ignores unsupported HTTP methods like DELETE", () => {
    const doc = {
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/widgets/{id}": { delete: { summary: "Delete a widget", responses: {} } },
      },
    };
    expect(extractEndpointFromOpenApi(doc)).toBeNull();
  });

  it("falls back to a generated summary when none is provided", () => {
    const doc = {
      servers: [{ url: "https://api.example.com" }],
      paths: {
        "/status": {
          get: { responses: { "200": { content: { "application/json": { schema: { properties: { ok: { type: "boolean" } } } } } } } },
        },
      },
    };
    const descriptor = extractEndpointFromOpenApi(doc);
    expect(descriptor?.summary).toBe("GET /status");
  });
});
