import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPool, ensureMigrated, hasTestDatabase, truncateAll } from "../test-support/db.js";
import { createUser, findUserByAuthRef, findUserById } from "./user-repo.js";

describe.skipIf(!hasTestDatabase())("userRepo (integration)", () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createTestPool();
    await ensureMigrated(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates a user and finds it by id", async () => {
    const created = await createUser(pool, { authRef: "owner-token-hash-1" });
    expect(created.authRef).toBe("owner-token-hash-1");

    const found = await findUserById(pool, created.id);
    expect(found).toEqual(created);
  });

  it("finds a user by authRef", async () => {
    const created = await createUser(pool, { authRef: "owner-token-hash-2" });
    const found = await findUserByAuthRef(pool, "owner-token-hash-2");
    expect(found).toEqual(created);
  });

  it("returns null for an unknown id", async () => {
    expect(await findUserById(pool, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("rejects a duplicate authRef (unique constraint)", async () => {
    await createUser(pool, { authRef: "dup" });
    await expect(createUser(pool, { authRef: "dup" })).rejects.toThrow();
  });
});
