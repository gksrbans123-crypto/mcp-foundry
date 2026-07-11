import { SERVICE_NAME } from "@mcp-foundry/shared";
import { describe, expect, it } from "vitest";
import { executeTool, loadServerSpec } from "../interpreter/index.js";
import type { FetchGuard } from "../interpreter/types.js";
import weatherFixture from "./weather.json" with { type: "json" };

describe("weather fixture", () => {
  it("passes declarative-spec schema validation", () => {
    const result = loadServerSpec(weatherFixture);
    expect(result.ok).toBe(true);
  });

  it("keeps the forbidden 'kakao' substring out of every server/tool text field", () => {
    const haystacks = [
      weatherFixture.name,
      weatherFixture.slug,
      weatherFixture.description,
      ...weatherFixture.tools.flatMap((tool) => [tool.name, tool.title, tool.description]),
    ];
    for (const text of haystacks) {
      expect(text.toLowerCase()).not.toContain("kakao");
    }
  });

  it("mentions SERVICE_NAME in the server description (bilingual pairing stays in sync)", () => {
    expect(weatherFixture.description).toContain(SERVICE_NAME);
  });

  it("declares exactly 3 read-only tools, all cache-eligible under the 300s cap", () => {
    expect(weatherFixture.tools).toHaveLength(3);
    for (const tool of weatherFixture.tools) {
      expect(tool.annotations.readOnlyHint).toBe(true);
      expect(tool.cacheTtlSeconds).toBeLessThanOrEqual(300);
    }
  });

  it("runs get_current_weather end to end against a mocked upstream", async () => {
    const result = loadServerSpec(weatherFixture);
    if (!result.ok) throw new Error("fixture failed to load");
    const tool = result.value.tools.find((t) => t.name === "get_current_weather");
    if (!tool) throw new Error("tool not found");

    const fetchGuard: FetchGuard = async () =>
      new Response(
        JSON.stringify({
          current: { time: "2026-07-09T12:00", temperature_2m: 24.1, wind_speed_10m: 8.2, relative_humidity_2m: 55 },
        }),
      );

    const markdown = await executeTool(tool, { latitude: 37.57, longitude: 126.98 }, { fetchGuard });
    expect(markdown).toBe(
      "**Current Weather**\n\n- Time: 2026-07-09T12:00\n- Temperature: 24.1 °C\n- Wind speed: 8.2 km/h\n- Humidity: 55%",
    );
  });

  it("runs get_forecast end to end against a mocked upstream", async () => {
    const result = loadServerSpec(weatherFixture);
    if (!result.ok) throw new Error("fixture failed to load");
    const tool = result.value.tools.find((t) => t.name === "get_forecast");
    if (!tool) throw new Error("tool not found");

    const fetchGuard: FetchGuard = async () =>
      new Response(
        JSON.stringify({
          daily: {
            time: ["2026-07-09", "2026-07-10", "2026-07-11"],
            temperature_2m_max: [30, 29, 31],
            temperature_2m_min: [22, 21, 23],
            precipitation_sum: [0, 2.4, 0],
          },
        }),
      );

    const markdown = await executeTool(tool, { latitude: 37.57, longitude: 126.98 }, { fetchGuard });
    expect(markdown).toContain("2026-07-09");
    expect(markdown).toContain("30");
    expect(markdown).toContain("2026-07-11");
  });

  it("runs compare_weather end to end against a mocked multi-location upstream", async () => {
    const result = loadServerSpec(weatherFixture);
    if (!result.ok) throw new Error("fixture failed to load");
    const tool = result.value.tools.find((t) => t.name === "compare_weather");
    if (!tool) throw new Error("tool not found");

    const fetchGuard: FetchGuard = async () =>
      new Response(
        JSON.stringify([
          { latitude: 37.57, longitude: 126.98, current: { temperature_2m: 24.1 } },
          { latitude: 35.18, longitude: 129.08, current: { temperature_2m: 26.5 } },
        ]),
      );

    const markdown = await executeTool(
      tool,
      { latitudes: "37.57,35.18", longitudes: "126.98,129.08" },
      { fetchGuard },
    );
    expect(markdown).toBe(
      "**Weather Comparison**\n\n- Location A (37.57, 126.98): 24.1 °C\n- Location B (35.18, 129.08): 26.5 °C",
    );
  });
});
