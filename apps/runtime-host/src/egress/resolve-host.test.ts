import { describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn();
vi.mock("node:dns/promises", () => ({ lookup: (...args: unknown[]) => lookupMock(...args) }));

const { defaultResolveHost } = await import("./resolve-host.js");
const { EgressBlockedError } = await import("./errors.js");

describe("defaultResolveHost", () => {
  it("returns every resolved address when all are public", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "93.184.216.35", family: 4 },
    ]);
    const addresses = await defaultResolveHost("api.example.com");
    expect(addresses).toEqual(["93.184.216.34", "93.184.216.35"]);
  });

  it("rejects when any resolved address (not just the first) is private", async () => {
    lookupMock.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);
    await expect(defaultResolveHost("api.example.com")).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it("rejects when the resolved address is a cloud metadata address", async () => {
    lookupMock.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);
    await expect(defaultResolveHost("metadata.internal")).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it("rejects when DNS resolution itself fails", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(defaultResolveHost("does-not-exist.invalid")).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it("rejects when DNS resolves to zero addresses", async () => {
    lookupMock.mockResolvedValue([]);
    await expect(defaultResolveHost("api.example.com")).rejects.toBeInstanceOf(EgressBlockedError);
  });
});
