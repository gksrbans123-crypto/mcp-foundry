import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { createPool } from "../pool.js";
import { runMigrations } from "../migrator.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "..", "migrations");

/**
 * Integration tests only run when DATABASE_URL is set (task #2 completion
 * criteria) — e.g. `DATABASE_URL=postgres://... pnpm test` against the
 * docker-compose Postgres. Without it, suites using this flag no-op via
 * `describe.skipIf`.
 */
export function hasTestDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function createTestPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("createTestPool: DATABASE_URL is not set");
  }
  return createPool(process.env.DATABASE_URL);
}

export async function ensureMigrated(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await runMigrations(client, migrationsDir);
  } finally {
    client.release();
  }
}

/** Clears all domain tables between tests, keeping the schema in place. */
export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query("TRUNCATE TABLE status_events, jobs, servers, users RESTART IDENTITY CASCADE");
}
