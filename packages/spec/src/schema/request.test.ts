import { describe, expect, it } from "vitest";
import { requestSchema } from "./request.js";

function base() {
  return {
    method: "GET" as const,
    urlTemplate: "https://api.open-meteo.com/v1/forecast",
    headers: [],
    query: [],
    body: null,
  };
}

describe("requestSchema", () => {
  it("accepts a plain https GET request", () => {
    expect(requestSchema.safeParse(base()).success).toBe(true);
  });

  it("accepts a path placeholder token", () => {
    const spec = { ...base(), urlTemplate: "https://api.example.com/v1/{id}/detail" };
    expect(requestSchema.safeParse(spec).success).toBe(true);
  });

  it("rejects a non-https scheme", () => {
    const spec = { ...base(), urlTemplate: "http://api.example.com/v1/forecast" };
    expect(requestSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a placeholder token inside the host (host-injection attempt)", () => {
    const spec = { ...base(), urlTemplate: "https://{host}/v1/forecast" };
    expect(requestSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a literal query string embedded in urlTemplate", () => {
    const spec = { ...base(), urlTemplate: "https://api.example.com/v1/forecast?x=1" };
    expect(requestSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a userinfo segment (@) in urlTemplate", () => {
    const spec = { ...base(), urlTemplate: "https://evil@api.example.com/v1/forecast" };
    expect(requestSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a header name outside the allowlist", () => {
    const spec = { ...base(), headers: [{ name: "authorization", value: "Bearer x" }] };
    expect(requestSchema.safeParse(spec).success).toBe(false);
  });

  it("accepts an allowlisted static header", () => {
    const spec = { ...base(), headers: [{ name: "accept", value: "application/json" }] };
    expect(requestSchema.safeParse(spec).success).toBe(true);
  });

  it("rejects a query mapping with both param and value set", () => {
    const spec = { ...base(), query: [{ key: "q", param: "latitude", value: "1" }] };
    expect(requestSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a query mapping with neither param nor value set", () => {
    const spec = { ...base(), query: [{ key: "q" }] };
    expect(requestSchema.safeParse(spec).success).toBe(false);
  });

  it("rejects a GET request that declares a body", () => {
    const spec = {
      ...base(),
      method: "GET" as const,
      body: { contentType: "application/json" as const, fields: [] },
    };
    expect(requestSchema.safeParse(spec).success).toBe(false);
  });

  it("accepts a POST request with a JSON body mapping", () => {
    const spec = {
      ...base(),
      method: "POST" as const,
      body: { contentType: "application/json" as const, fields: [{ key: "q", param: "query" }] },
    };
    expect(requestSchema.safeParse(spec).success).toBe(true);
  });
});
