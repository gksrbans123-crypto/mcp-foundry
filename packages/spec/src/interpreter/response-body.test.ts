import { describe, expect, it } from "vitest";
import { ResponseTooLargeError, readBodyWithLimit, safeJsonParse } from "./response-body.js";

function responseFrom(text: string): Response {
  return new Response(text);
}

describe("readBodyWithLimit", () => {
  it("reads a body under the limit in full", async () => {
    const text = await readBodyWithLimit(responseFrom("hello world"), 1024);
    expect(text).toBe("hello world");
  });

  it("throws ResponseTooLargeError once the streamed bytes exceed the limit", async () => {
    const big = "x".repeat(1000);
    await expect(readBodyWithLimit(responseFrom(big), 10)).rejects.toBeInstanceOf(ResponseTooLargeError);
  });

  it("handles a response with no body", async () => {
    const response = new Response(null, { status: 204 });
    const text = await readBodyWithLimit(response, 1024);
    expect(text).toBe("");
  });
});

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns undefined for invalid JSON instead of throwing", () => {
    expect(safeJsonParse("not json {")).toBeUndefined();
  });
});
