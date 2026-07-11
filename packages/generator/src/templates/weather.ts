import { loadServerSpec, weatherFixture, type ServerSpec } from "@mcp-foundry/spec";
import { toSlug } from "../slug.js";
import type { Template } from "./types.js";

function loadWeatherSpec(): ServerSpec {
  const result = loadServerSpec(weatherFixture);
  if (!result.ok) {
    throw new Error(`weather template fixture failed to load: ${result.errors.join("; ")}`);
  }
  return result.value;
}

export const weatherTemplate: Template = {
  id: "weather",
  keywords: ["weather", "forecast", "날씨", "기온", "일기예보"],
  buildSpec: (overrides) => {
    const base = structuredClone(loadWeatherSpec());
    if (!overrides?.name) return base;
    return { ...base, name: overrides.name, slug: toSlug(overrides.name) };
  },
};
