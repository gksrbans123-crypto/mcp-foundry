import { loadServerSpec } from "@mcp-foundry/spec";
import { validateSpec } from "@mcp-foundry/validator";
import { describe, expect, it } from "vitest";
import { buildHttpWrapperSpec } from "../wrapper/build-spec.js";
import { augmentToolCount } from "./tool-count.js";

const DESCRIPTOR = {
  method: "GET" as const,
  url: "https://api.example.com/quote",
  params: [{ name: "symbol", type: "string" as const, description: "Ticker.", in: "query" as const, required: true }],
  responseFieldHints: [{ name: "price", path: "price" }],
  summary: "Get a stock quote",
};

describe("augmentToolCount", () => {
  it("leaves a spec with >=3 tools untouched", () => {
    const base = buildHttpWrapperSpec(DESCRIPTOR, { nl: "x" });
    const threeTool = { ...base, tools: [base.tools[0]!, base.tools[0]!, base.tools[0]!] };
    expect(augmentToolCount(threeTool)).toBe(threeTool);
  });

  it("clones the first tool to reach 3 tools when starting from 1", () => {
    const spec = buildHttpWrapperSpec(DESCRIPTOR, { nl: "x" });
    const augmented = augmentToolCount(spec);
    expect(augmented.tools).toHaveLength(3);
    const names = augmented.tools.map((t) => t.name);
    expect(new Set(names).size).toBe(3);
  });

  it("produces a spec that passes structural and business validation after augmentation", () => {
    const spec = buildHttpWrapperSpec(DESCRIPTOR, { nl: "x" });
    const augmented = augmentToolCount(spec);
    const loaded = loadServerSpec(augmented);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(validateSpec(loaded.value)).toEqual({ valid: true, violations: [] });
  });

  it("does not mutate the original spec object", () => {
    const spec = buildHttpWrapperSpec(DESCRIPTOR, { nl: "x" });
    const originalToolCount = spec.tools.length;
    augmentToolCount(spec);
    expect(spec.tools).toHaveLength(originalToolCount);
  });
});
