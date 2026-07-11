import { describe, expect, it } from "vitest";
import { computeParsedSpecHash } from "./hash.js";

describe("computeParsedSpecHash", () => {
  it("is stable across different key insertion orders", () => {
    const specA = { tool: "get_weather", params: { city: "seoul", unit: "c" } };
    const specB = { params: { unit: "c", city: "seoul" }, tool: "get_weather" };
    expect(computeParsedSpecHash(specA)).toBe(computeParsedSpecHash(specB));
  });

  it("produces different hashes for different specs", () => {
    const specA = { tool: "get_weather", params: { city: "seoul" } };
    const specB = { tool: "get_weather", params: { city: "busan" } };
    expect(computeParsedSpecHash(specA)).not.toBe(computeParsedSpecHash(specB));
  });

  it("is stable across repeated calls with the same input", () => {
    const spec = { tool: "get_news", params: { query: "kbo" } };
    expect(computeParsedSpecHash(spec)).toBe(computeParsedSpecHash(spec));
  });

  it("hashes nested arrays consistently regardless of object key order within elements", () => {
    const specA = { steps: [{ a: 1, b: 2 }, { c: 3, d: 4 }] };
    const specB = { steps: [{ b: 2, a: 1 }, { d: 4, c: 3 }] };
    expect(computeParsedSpecHash(specA)).toBe(computeParsedSpecHash(specB));
  });

  it("returns a 64-character hex sha256 digest", () => {
    expect(computeParsedSpecHash({ x: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });
});
