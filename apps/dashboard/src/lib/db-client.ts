import { createPool, type Pool } from "@mcp-foundry/db";

// `undefined` = not attempted yet, `null` = DATABASE_URL unset (mock mode by
// design, not a failure). Module-level singleton so every server component
// render in this process reuses one pool instead of opening a new one.
let pool: Pool | null | undefined;

export function getPool(): Pool | null {
  if (pool !== undefined) return pool;
  const connectionString = process.env.DATABASE_URL;
  pool = connectionString ? createPool(connectionString) : null;
  return pool;
}

/**
 * Logs only the error name/kind server-side — never the error message or
 * connection string, either of which can embed host/credential details
 * depending on the underlying pg error path (plan §6: no secrets leaked via
 * errors). Callers must not forward the caught error to the rendered page.
 */
export function logDashboardDataError(context: string, error: unknown): void {
  const kind = error instanceof Error ? error.name : "UnknownError";
  console.error(`[dashboard] ${context} failed (${kind})`);
}
