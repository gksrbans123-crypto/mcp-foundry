import pg from "pg";
import type { QueryResultRow } from "pg";

const { Pool } = pg;
export type { Pool, PoolClient, QueryResult, QueryResultRow } from "pg";

/**
 * Structural subset of pg's Pool/PoolClient that repos depend on. Accepting
 * this instead of the concrete Pool type lets every repo function run
 * equally well against a plain pool query or a checked-out transaction
 * client (see transaction.ts), without repos needing to know which one
 * they were handed.
 *
 * The generic is bounded by pg's own QueryResultRow (an `any`-valued index
 * signature) rather than `Record<string, unknown>` — an `unknown`-valued
 * index signature forces every row interface to redeclare `[key: string]:
 * unknown`, which plain `interface FooRow { ... }` shapes don't do.
 */
export interface Queryable {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}

/**
 * SSL config for a connection string. Local/plaintext Postgres needs none;
 * managed cloud Postgres (Supabase, Neon, RDS, …) requires TLS. We use
 * `rejectUnauthorized: false` so connections work without shipping the
 * provider's CA bundle — pragmatic for a hosted demo. Set `?sslmode=disable`
 * to force it off. (Follow-up hardening: pin the provider CA and verify.)
 */
export function resolveDbSsl(connectionString: string): pg.PoolConfig["ssl"] {
  if (/[?&]sslmode=disable\b/.test(connectionString)) return undefined;
  if (/@(localhost|127\.0\.0\.1|\[::1\]|host\.docker\.internal|postgres)[:/]/.test(connectionString)) {
    return undefined;
  }
  return { rejectUnauthorized: false };
}

export function createPool(connectionString: string): pg.Pool {
  return new Pool({ connectionString, ssl: resolveDbSsl(connectionString) });
}
