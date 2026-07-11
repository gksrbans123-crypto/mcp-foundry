import { describe, expect, it } from "vitest";
import { TtlCache } from "./ttl-cache.js";

describe("TtlCache", () => {
  it("returns a stored value before it expires", () => {
    const cache = new TtlCache();
    cache.set("key", "value", 60, 1000);
    expect(cache.get("key", 1000 + 59_000)).toBe("value");
  });

  it("returns undefined once the TTL has elapsed, and evicts the entry", () => {
    const cache = new TtlCache();
    cache.set("key", "value", 60, 1000);
    expect(cache.get("key", 1000 + 60_000)).toBeUndefined();
    expect(cache.size()).toBe(0);
  });

  it("returns undefined for a key that was never set", () => {
    const cache = new TtlCache();
    expect(cache.get("missing")).toBeUndefined();
  });

  it("caps an oversized TTL at CACHE_TTL_MAX_SECONDS (300s) regardless of what is passed in", () => {
    const cache = new TtlCache();
    cache.set("key", "value", 100_000, 1000);
    // Still present just before the 300s cap...
    expect(cache.get("key", 1000 + 300_000 - 1)).toBe("value");
    // ...but gone at/after it, proving the 100_000s request was capped, not honored.
    expect(cache.get("key", 1000 + 300_000)).toBeUndefined();
  });

  it("treats a zero or negative TTL as not cacheable at all", () => {
    const cache = new TtlCache();
    cache.set("key", "value", 0, 1000);
    expect(cache.get("key", 1000)).toBeUndefined();
    expect(cache.size()).toBe(0);
  });
});
