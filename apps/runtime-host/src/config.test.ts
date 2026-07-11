import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("applies defaults when no env vars are set", () => {
    const config = loadConfig({});
    expect(config.port).toBe(3002);
    expect(config.egressAllowlist).toEqual([]);
    expect(config.specStoreDir).toBe("./data/specs");
    expect(config.databaseUrl).toBeUndefined();
  });

  it("parses RUNTIME_PORT from the environment", () => {
    const config = loadConfig({ RUNTIME_PORT: "4100" });
    expect(config.port).toBe(4100);
  });

  it("throws for a non-numeric RUNTIME_PORT", () => {
    expect(() => loadConfig({ RUNTIME_PORT: "not-a-port" })).toThrow();
  });

  it("throws for a zero or negative RUNTIME_PORT", () => {
    expect(() => loadConfig({ RUNTIME_PORT: "0" })).toThrow();
    expect(() => loadConfig({ RUNTIME_PORT: "-1" })).toThrow();
  });

  it("splits, trims, and lowercases EGRESS_ALLOWLIST", () => {
    const config = loadConfig({ EGRESS_ALLOWLIST: " Api.Example.com , other.example.com ,," });
    expect(config.egressAllowlist).toEqual(["api.example.com", "other.example.com"]);
  });

  it("treats an empty DATABASE_URL as unset", () => {
    const config = loadConfig({ DATABASE_URL: "" });
    expect(config.databaseUrl).toBeUndefined();
  });

  it("passes through a non-empty DATABASE_URL", () => {
    const config = loadConfig({ DATABASE_URL: "postgres://localhost/db" });
    expect(config.databaseUrl).toBe("postgres://localhost/db");
  });
});
