import { SERVICE_NAME } from "@mcp-foundry/shared";
import { NAME_PATTERN } from "@mcp-foundry/spec";
import { describe, expect, it } from "vitest";
import { TOOL_METADATA, TOOL_NAMES } from "./metadata.js";

describe("tool metadata (plan §3/§8 compliance)", () => {
  it("declares exactly 7 tools (plan §3 table)", () => {
    expect(TOOL_NAMES).toHaveLength(7);
  });

  it("has unique tool names", () => {
    expect(new Set(TOOL_NAMES).size).toBe(TOOL_NAMES.length);
  });

  it.each(TOOL_NAMES)("%s: name matches [A-Za-z0-9_-]{1,128} and is unique to its own entry", (name) => {
    const meta = TOOL_METADATA[name];
    expect(meta.name).toBe(name);
    expect(meta.name).toMatch(NAME_PATTERN);
  });

  it.each(TOOL_NAMES)("%s: description is non-empty and <= 1024 chars", (name) => {
    const { description } = TOOL_METADATA[name];
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);
  });

  it.each(TOOL_NAMES)("%s: description embeds the bilingual SERVICE_NAME constant", (name) => {
    expect(TOOL_METADATA[name].description).toContain(SERVICE_NAME);
  });

  it.each(TOOL_NAMES)("%s: declares all 5 required annotation hints", (name) => {
    const { annotations } = TOOL_METADATA[name];
    expect(typeof annotations.title).toBe("string");
    expect(annotations.title.length).toBeGreaterThan(0);
    expect(typeof annotations.readOnlyHint).toBe("boolean");
    expect(typeof annotations.destructiveHint).toBe("boolean");
    expect(typeof annotations.idempotentHint).toBe("boolean");
    expect(typeof annotations.openWorldHint).toBe("boolean");
  });

  it.each(TOOL_NAMES)("%s: no 'kakao' substring anywhere, case-insensitive", (name) => {
    const meta = TOOL_METADATA[name];
    const haystack = `${meta.name} ${meta.annotations.title} ${meta.description}`.toLowerCase();
    expect(haystack).not.toContain("kakao");
  });
});
