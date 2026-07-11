import type { Pool } from "pg";
import type { Queryable } from "./pool.js";

/**
 * Runs `fn` against a single checked-out client wrapped in BEGIN/COMMIT,
 * rolling back on any thrown error. This is the mechanism behind the R5
 * invariant (plan §6): callers combine a job stage advance with a
 * status_event append and get atomicity for free by passing the same
 * `Queryable` client into both repo calls.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: Queryable) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
