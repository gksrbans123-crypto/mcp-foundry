import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPool, ensureMigrated, hasTestDatabase, truncateAll } from "../test-support/db.js";
import { createUser } from "./user-repo.js";
import {
  createServerFromJob,
  findServerByDeployIdempotencyKey,
  findServerBySlug,
  listServersByUser,
  SlugConflictError,
  softDeleteServer,
  updateServer,
} from "./server-repo.js";

describe.skipIf(!hasTestDatabase())("serverRepo (integration)", () => {
  let pool: Pool;
  let userId: string;

  beforeAll(async () => {
    pool = createTestPool();
    await ensureMigrated(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
    userId = (await createUser(pool, { authRef: "server-repo-owner" })).id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("throws SlugConflictError when the slug is taken under a different idempotency key", async () => {
    await createServerFromJob(pool, {
      userId,
      name: "weather-bot",
      slug: "weather-lookup",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-a",
    });

    await expect(
      createServerFromJob(pool, {
        userId,
        name: "weather-bot-2",
        slug: "weather-lookup",
        mcpVersion: "2025-06-18",
        tools: [],
        idempotencyKey: "hash-b",
      }),
    ).rejects.toBeInstanceOf(SlugConflictError);
  });

  it("creates a server from a job and finds it by slug", async () => {
    const { server, alreadyExisted } = await createServerFromJob(pool, {
      userId,
      name: "weather-bot",
      slug: "weather-bot",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-1",
    });
    expect(alreadyExisted).toBe(false);
    expect(server.status).toBe("building");

    expect(await findServerBySlug(pool, "weather-bot")).toEqual(server);
  });

  it("enforces R5 deploy idempotency: same idempotencyKey reuses the existing server instead of duplicating", async () => {
    const first = await createServerFromJob(pool, {
      userId,
      name: "weather-bot",
      slug: "weather-bot",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "shared-hash",
    });
    const second = await createServerFromJob(pool, {
      userId,
      name: "weather-bot-retry",
      slug: "weather-bot-retry",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "shared-hash",
    });

    expect(first.alreadyExisted).toBe(false);
    expect(second.alreadyExisted).toBe(true);
    expect(second.server.id).toBe(first.server.id);
    expect(second.server.slug).toBe("weather-bot"); // the retry's slug was never inserted

    const bySlug = await findServerBySlug(pool, "weather-bot-retry");
    expect(bySlug).toBeNull();
    expect(await findServerByDeployIdempotencyKey(pool, "shared-hash")).toEqual(first.server);
  });

  it("updates only the provided fields and leaves the rest untouched", async () => {
    const { server } = await createServerFromJob(pool, {
      userId,
      name: "news-bot",
      slug: "news-bot",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-2",
    });

    const updated = await updateServer(pool, server.id, {
      status: "active",
      publicUrl: "https://example.com/s/news-bot/mcp",
    });

    expect(updated.status).toBe("active");
    expect(updated.publicUrl).toBe("https://example.com/s/news-bot/mcp");
    expect(updated.name).toBe("news-bot");
    expect(updated.slug).toBe("news-bot");
  });

  it("lists servers by user, optionally filtered by status", async () => {
    await createServerFromJob(pool, {
      userId,
      name: "a",
      slug: "a",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-a",
    });
    const { server: b } = await createServerFromJob(pool, {
      userId,
      name: "b",
      slug: "b",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-b",
    });
    await updateServer(pool, b.id, { status: "active" });

    expect(await listServersByUser(pool, userId)).toHaveLength(2);
    const activeOnly = await listServersByUser(pool, userId, { status: ["active"] });
    expect(activeOnly).toHaveLength(1);
    expect(activeOnly[0]?.id).toBe(b.id);
  });

  it("softDeleteServer is idempotent — re-deleting an already-deleted server is a no-op", async () => {
    const { server } = await createServerFromJob(pool, {
      userId,
      name: "c",
      slug: "c",
      mcpVersion: "2025-06-18",
      tools: [],
      idempotencyKey: "hash-c",
    });

    const firstDelete = await softDeleteServer(pool, server.id);
    expect(firstDelete.status).toBe("deleted");

    const secondDelete = await softDeleteServer(pool, server.id);
    expect(secondDelete.status).toBe("deleted");
    expect(secondDelete.id).toBe(server.id);
  });
});
