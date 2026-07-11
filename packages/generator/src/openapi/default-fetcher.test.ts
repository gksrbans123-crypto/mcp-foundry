import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultOpenApiFetcher } from "./types.js";

describe("defaultOpenApiFetcher", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed JSON body on a successful fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ paths: {} }) }) as unknown as Response),
    );
    await expect(defaultOpenApiFetcher("https://api.example.com/openapi.json")).resolves.toEqual({ paths: {} });
  });

  it("throws a descriptive error on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404, statusText: "Not Found" }) as unknown as Response),
    );
    await expect(defaultOpenApiFetcher("https://api.example.com/missing.json")).rejects.toThrow(/404/);
  });
});
