import { describe, expect, it } from "vitest";
import { buildCacheKey } from "./cache-key.js";

describe("buildCacheKey", () => {
  it("produces the same key regardless of argument key order", () => {
    const a = buildCacheKey("weather-lookup", "get_current_weather", { longitude: 2, latitude: 1 });
    const b = buildCacheKey("weather-lookup", "get_current_weather", { latitude: 1, longitude: 2 });
    expect(a).toBe(b);
  });

  it("R4: two different tenants (slugs) never collide on the same tool + args", () => {
    const args = { latitude: 37.57, longitude: 126.98 };
    const tenantA = buildCacheKey("weather-demo-a", "get_current_weather", args);
    const tenantB = buildCacheKey("weather-demo-b", "get_current_weather", args);
    expect(tenantA).not.toBe(tenantB);
  });

  it("differs when the tool name differs for the same tenant and args", () => {
    const args = { latitude: 1, longitude: 2 };
    const toolA = buildCacheKey("weather-demo", "get_current_weather", args);
    const toolB = buildCacheKey("weather-demo", "get_forecast", args);
    expect(toolA).not.toBe(toolB);
  });

  it("differs when the argument values differ", () => {
    const a = buildCacheKey("weather-demo", "get_current_weather", { latitude: 1 });
    const b = buildCacheKey("weather-demo", "get_current_weather", { latitude: 2 });
    expect(a).not.toBe(b);
  });
});
