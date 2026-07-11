import type { Queryable } from "@mcp-foundry/db";
import type { Server } from "@mcp-foundry/shared";
import { describe, expect, it, vi } from "vitest";

const findServerBySlugMock = vi.fn();
vi.mock("@mcp-foundry/db", () => ({ findServerBySlug: (...args: unknown[]) => findServerBySlugMock(...args) }));

const { DbStatusGatedSpecRegistry } = await import("./db-status-gated-registry.js");
const { InMemorySpecRegistry } = await import("./memory-registry.js");

const fakeDb = {} as Queryable;

function serverRow(overrides: Partial<Server> = {}): Server {
  return {
    id: "server-1",
    userId: "user-1",
    name: "Weather Lookup",
    slug: "weather-demo",
    publicUrl: "https://example.com/s/weather-demo/mcp",
    mcpVersion: "2025-06-18",
    status: "active",
    tools: [],
    probeResult: null,
    deployRef: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("DbStatusGatedSpecRegistry", () => {
  it("delegates to the inner registry when the server exists and is active", async () => {
    findServerBySlugMock.mockResolvedValue(serverRow({ status: "active" }));
    const inner = new InMemorySpecRegistry();
    const registry = new DbStatusGatedSpecRegistry(fakeDb, inner);

    const getSpy = vi.spyOn(inner, "get").mockResolvedValue(null);
    await registry.get("weather-demo");
    expect(getSpy).toHaveBeenCalledWith("weather-demo");
  });

  it("returns null without consulting the inner registry when the server row is missing", async () => {
    findServerBySlugMock.mockResolvedValue(null);
    const inner = new InMemorySpecRegistry();
    const getSpy = vi.spyOn(inner, "get");
    const registry = new DbStatusGatedSpecRegistry(fakeDb, inner);

    expect(await registry.get("does-not-exist")).toBeNull();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("returns null for a server that exists but is not active (deleted)", async () => {
    findServerBySlugMock.mockResolvedValue(serverRow({ status: "deleted" }));
    const inner = new InMemorySpecRegistry();
    const getSpy = vi.spyOn(inner, "get");
    const registry = new DbStatusGatedSpecRegistry(fakeDb, inner);

    expect(await registry.get("weather-demo")).toBeNull();
    expect(getSpy).not.toHaveBeenCalled();
  });

  it("returns null for a server stuck in 'building' or 'failed'", async () => {
    const inner = new InMemorySpecRegistry();
    const registry = new DbStatusGatedSpecRegistry(fakeDb, inner);

    findServerBySlugMock.mockResolvedValue(serverRow({ status: "building" }));
    expect(await registry.get("weather-demo")).toBeNull();

    findServerBySlugMock.mockResolvedValue(serverRow({ status: "failed" }));
    expect(await registry.get("weather-demo")).toBeNull();
  });

  it("set() writes through to the inner registry", async () => {
    const inner = new InMemorySpecRegistry();
    const setSpy = vi.spyOn(inner, "set").mockResolvedValue(undefined);
    const registry = new DbStatusGatedSpecRegistry(fakeDb, inner);

    const fakeSpec = { slug: "weather-demo" } as Parameters<typeof registry.set>[0];
    await registry.set(fakeSpec);
    expect(setSpy).toHaveBeenCalledWith(fakeSpec);
  });
});
