import { loadServerSpec } from "@mcp-foundry/spec";
import { describe, expect, it } from "vitest";
import type { EndpointDescriptor } from "../types.js";
import { buildHttpWrapperSpec } from "./build-spec.js";

const GET_DESCRIPTOR: EndpointDescriptor = {
  method: "GET",
  url: "https://api.example.com/quote/{symbol}",
  params: [
    { name: "symbol", type: "string", description: "Ticker symbol.", in: "path", required: true },
    { name: "range", type: "string", description: "Date range.", in: "query", required: false },
  ],
  responseFieldHints: [
    { name: "price", path: "price" },
    { name: "price!!", path: "meta.currency" },
  ],
  summary: "Get a stock quote",
};

describe("buildHttpWrapperSpec", () => {
  it("produces a structurally valid single-tool spec", () => {
    const spec = buildHttpWrapperSpec(GET_DESCRIPTOR, { nl: "get me a stock quote" });
    expect(spec.tools).toHaveLength(1);
    const loaded = loadServerSpec(spec);
    expect(loaded.ok).toBe(true);
  });

  it("wires a path param via the url template, not as a query mapping", () => {
    const spec = buildHttpWrapperSpec(GET_DESCRIPTOR, { nl: "get me a stock quote" });
    const tool = spec.tools[0]!;
    expect(tool.request.urlTemplate).toBe("https://api.example.com/quote/{symbol}");
    expect(tool.request.query.some((q) => q.param === "symbol")).toBe(false);
    expect(tool.request.query.some((q) => q.param === "range")).toBe(true);
  });

  it("derives path-vs-query from the url text even if `in` disagrees", () => {
    const descriptor: EndpointDescriptor = {
      ...GET_DESCRIPTOR,
      params: [{ name: "symbol", type: "string", description: "x", in: "query", required: true }],
    };
    const spec = buildHttpWrapperSpec(descriptor, { nl: "x" });
    const tool = spec.tools[0]!;
    // url still contains {symbol}, so it must be treated as path-bound regardless of the declared `in`.
    expect(tool.request.query.some((q) => q.param === "symbol")).toBe(false);
  });

  it("uses a request body for POST instead of query params", () => {
    const descriptor: EndpointDescriptor = { ...GET_DESCRIPTOR, method: "POST", url: "https://api.example.com/quote" };
    const spec = buildHttpWrapperSpec(descriptor, { nl: "x" });
    const tool = spec.tools[0]!;
    expect(tool.request.method).toBe("POST");
    expect(tool.request.query).toEqual([]);
    expect(tool.request.body?.fields.map((f) => f.param)).toEqual(["symbol", "range"]);
  });

  it("sets annotations based on method (GET readOnly, POST mutating)", () => {
    const getSpec = buildHttpWrapperSpec(GET_DESCRIPTOR, { nl: "x" });
    expect(getSpec.tools[0]!.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });

    const postSpec = buildHttpWrapperSpec({ ...GET_DESCRIPTOR, method: "POST", url: "https://api.example.com/quote" }, { nl: "x" });
    expect(postSpec.tools[0]!.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it("sanitizes and de-duplicates response field selector names", () => {
    const spec = buildHttpWrapperSpec(GET_DESCRIPTOR, { nl: "x" });
    const names = spec.tools[0]!.response.fieldSelectors.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(n))).toBe(true);
  });

  it("only sets cacheTtlSeconds for GET", () => {
    const getSpec = buildHttpWrapperSpec(GET_DESCRIPTOR, { nl: "x" });
    expect(getSpec.tools[0]!.cacheTtlSeconds).toBeDefined();
    const postSpec = buildHttpWrapperSpec({ ...GET_DESCRIPTOR, method: "POST", url: "https://api.example.com/quote" }, { nl: "x" });
    expect(postSpec.tools[0]!.cacheTtlSeconds).toBeUndefined();
  });

  it("uses request.name when provided, otherwise falls back to the descriptor summary", () => {
    const named = buildHttpWrapperSpec(GET_DESCRIPTOR, { nl: "x", name: "My Stock Tool" });
    expect(named.name).toBe("My Stock Tool");
    expect(named.slug).toBe("my-stock-tool");

    const unnamed = buildHttpWrapperSpec(GET_DESCRIPTOR, { nl: "x" });
    expect(unnamed.name).toBe("Get a stock quote");
  });

  it("always includes an intact SERVICE_NAME mention in both descriptions", () => {
    const spec = buildHttpWrapperSpec(GET_DESCRIPTOR, { nl: "x" });
    expect(spec.description).toContain("MCP Foundry");
    expect(spec.tools[0]!.description).toContain("MCP Foundry");
  });
});
