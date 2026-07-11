import { describe, expect, it } from "vitest";
import { renderErrorMarkdown, renderMarkdownTemplate, selectFields } from "./format.js";

describe("selectFields", () => {
  it("resolves a dotted path", () => {
    const data = { current: { temperature_2m: 21.4 } };
    const fields = selectFields([{ name: "temperature", path: "current.temperature_2m" }], data);
    expect(fields).toEqual({ temperature: 21.4 });
  });

  it("resolves a bracket-indexed path within a nested key", () => {
    const data = { daily: { temperature_2m_max: [30, 28, 26] } };
    const fields = selectFields([{ name: "high", path: "daily.temperature_2m_max[0]" }], data);
    expect(fields).toEqual({ high: 30 });
  });

  it("resolves a root-level array index path", () => {
    const data = [{ current: { temperature_2m: 10 } }, { current: { temperature_2m: 20 } }];
    const fields = selectFields([{ name: "second", path: "[1].current.temperature_2m" }], data);
    expect(fields).toEqual({ second: 20 });
  });

  it("returns undefined (not a throw) for a missing key", () => {
    const fields = selectFields([{ name: "missing", path: "does.not.exist" }], {});
    expect(fields.missing).toBeUndefined();
  });

  it("returns undefined for an out-of-range array index", () => {
    const fields = selectFields([{ name: "oob", path: "list[5]" }], { list: [1, 2] });
    expect(fields.oob).toBeUndefined();
  });

  it("returns undefined instead of throwing when the shape does not match (index into an object)", () => {
    const fields = selectFields([{ name: "bad", path: "obj[0]" }], { obj: { a: 1 } });
    expect(fields.bad).toBeUndefined();
  });
});

describe("renderMarkdownTemplate", () => {
  it("substitutes declared fields", () => {
    const out = renderMarkdownTemplate("Temp: {{temperature}}C", { temperature: 21.4 });
    expect(out).toBe("Temp: 21.4C");
  });

  it("renders a fixed placeholder for a missing/undefined field rather than crashing", () => {
    const out = renderMarkdownTemplate("Temp: {{temperature}}", {});
    expect(out).toBe("Temp: —");
  });
});

describe("renderErrorMarkdown", () => {
  it("renders a title with no details", () => {
    expect(renderErrorMarkdown("Something failed")).toBe("**Error:** Something failed");
  });

  it("renders details as a bullet list and caps them at 10", () => {
    const details = Array.from({ length: 20 }, (_, i) => `detail ${i}`);
    const out = renderErrorMarkdown("Multiple issues", details);
    const lines = out.split("\n");
    expect(lines[0]).toBe("**Error:** Multiple issues");
    expect(lines.length).toBe(11);
  });
});
