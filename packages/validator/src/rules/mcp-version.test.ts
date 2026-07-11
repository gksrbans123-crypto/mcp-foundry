import { describe, expect, it } from "vitest";
import { makeValidSpec } from "../test-support.js";
import { checkMcpVersion } from "./mcp-version.js";

describe("checkMcpVersion", () => {
  it("passes a version within the supported range", () => {
    expect(checkMcpVersion(makeValidSpec({ server: { mcpVersion: "2025-06-18" } }))).toEqual([]);
  });

  it("passes the minimum boundary", () => {
    expect(checkMcpVersion(makeValidSpec({ server: { mcpVersion: "2025-03-26" } }))).toEqual([]);
  });

  it("passes the maximum boundary", () => {
    expect(checkMcpVersion(makeValidSpec({ server: { mcpVersion: "2025-11-25" } }))).toEqual([]);
  });

  it("flags a version before the minimum", () => {
    const violations = checkMcpVersion(makeValidSpec({ server: { mcpVersion: "2025-03-25" } }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "mcp-version" });
  });

  it("flags a version after the maximum", () => {
    const violations = checkMcpVersion(makeValidSpec({ server: { mcpVersion: "2025-11-26" } }));
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ rule: "mcp-version" });
  });
});
