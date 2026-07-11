import { describe, expect, it } from "vitest";
import { parseJsonLoosely } from "./parse-json.js";

describe("parseJsonLoosely", () => {
  it("parses plain JSON", () => {
    expect(parseJsonLoosely('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a ```json fence", () => {
    expect(parseJsonLoosely('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips a bare ``` fence", () => {
    expect(parseJsonLoosely('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("returns null for unparseable content", () => {
    expect(parseJsonLoosely("not json at all")).toBeNull();
  });
});
