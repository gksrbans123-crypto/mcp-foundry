import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const validEnv = {
  DATABASE_URL: "postgres://user:pass@localhost:5432/mcp_foundry",
  ANTHROPIC_API_KEY: "test-key",
  OWNER_TOKEN_SECRET: "test-secret-at-least-32-characters-long",
  PUBLIC_BASE_URL: "https://example.com",
  EGRESS_ALLOWLIST: "api.example.com",
};

describe("loadEnv", () => {
  it("parses a valid environment and applies port/model defaults", () => {
    const env = loadEnv(validEnv);
    expect(env.CREATOR_PORT).toBe(3001);
    expect(env.RUNTIME_PORT).toBe(3002);
    expect(env.DASHBOARD_PORT).toBe(3000);
    expect(env.GENERATOR_MODEL).toBe("claude-opus-4-8");
  });

  it("throws a descriptive error listing every missing required variable", () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects an invalid PUBLIC_BASE_URL", () => {
    expect(() => loadEnv({ ...validEnv, PUBLIC_BASE_URL: "not-a-url" })).toThrow();
  });

  it("defaults EGRESS_ALLOWLIST to an empty string (no extra egress restriction) when omitted", () => {
    const { EGRESS_ALLOWLIST: _omitted, ...withoutAllowlist } = validEnv;
    expect(loadEnv(withoutAllowlist).EGRESS_ALLOWLIST).toBe("");
  });

  it("rejects an OWNER_TOKEN_SECRET shorter than 32 characters", () => {
    expect(() => loadEnv({ ...validEnv, OWNER_TOKEN_SECRET: "too-short" })).toThrow(/OWNER_TOKEN_SECRET/);
  });

  it("accepts an OWNER_TOKEN_SECRET of exactly 32 characters", () => {
    const secret = "a".repeat(32);
    expect(loadEnv({ ...validEnv, OWNER_TOKEN_SECRET: secret }).OWNER_TOKEN_SECRET).toBe(secret);
  });

  it("does not mutate the source object", () => {
    const source = { ...validEnv };
    const frozenCopy = { ...source };
    loadEnv(source);
    expect(source).toEqual(frozenCopy);
  });
});
