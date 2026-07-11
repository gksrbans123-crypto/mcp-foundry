import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runMigrations } from "../src/migrator.js";
import { resolveDbSsl } from "../src/pool.js";

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "migrations");

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to run migrations");
  }

  const client = new Client({ connectionString: databaseUrl, ssl: resolveDbSsl(databaseUrl) });
  await client.connect();
  try {
    const { applied, skipped } = await runMigrations(client, migrationsDir);
    for (const file of skipped) console.log(`skip (already applied): ${file}`);
    for (const file of applied) console.log(`applied: ${file}`);
    console.log("migrations up to date");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("migration failed:", err);
  process.exitCode = 1;
});
