import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Queryable } from "./pool.js";

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applies every *.sql file in `migrationsDir` not yet recorded in
 * schema_migrations, in filename order, each in its own transaction.
 *
 * `db` must be a single fixed connection (a pg.Client, or a PoolClient
 * checked out via pool.connect()) — never a bare Pool. Pool.query() may
 * hand each call a different underlying connection, which would silently
 * break the BEGIN/COMMIT pairing below.
 */
export async function runMigrations(db: Queryable, migrationsDir: string): Promise<MigrationResult> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const appliedRows = await db.query<{ id: string }>(`SELECT id FROM schema_migrations`);
  const appliedIds = new Set(appliedRows.rows.map((row) => row.id));

  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (appliedIds.has(file)) {
      skipped.push(file);
      continue;
    }
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    await db.query("BEGIN");
    try {
      await db.query(sql);
      await db.query(`INSERT INTO schema_migrations (id) VALUES ($1)`, [file]);
      await db.query("COMMIT");
      applied.push(file);
    } catch (err) {
      await db.query("ROLLBACK");
      throw err;
    }
  }
  return { applied, skipped };
}
