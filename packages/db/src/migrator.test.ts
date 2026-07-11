import type { Pool } from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestPool, hasTestDatabase } from "./test-support/db.js";
import { runMigrations } from "./migrator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "migrations");

describe.skipIf(!hasTestDatabase())("runMigrations (integration)", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  it("applies pending migrations once and is a no-op on the next run", async () => {
    const client = await pool.connect();
    try {
      // A prior run (e.g. the CLI script against a shared dev DB) may have
      // already applied this migration, so only assert it's no longer
      // pending — not that this particular call is the one that applied it.
      const first = await runMigrations(client, migrationsDir);
      expect([...first.applied, ...first.skipped]).toContain("0001_init.sql");

      const second = await runMigrations(client, migrationsDir);
      expect(second.applied).toEqual([]);
      expect(second.skipped).toContain("0001_init.sql");
    } finally {
      client.release();
    }
  });

  it("leaves the tracked table listing every applied migration", async () => {
    const result = await pool.query<{ id: string }>("SELECT id FROM schema_migrations ORDER BY id");
    expect(result.rows.map((row) => row.id)).toContain("0001_init.sql");
  });
});
