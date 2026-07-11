import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPool,
  createServerFromJob,
  createUser,
  runMigrations,
  softDeleteServer,
  updateServer,
  type Pool,
} from "@mcp-foundry/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ServerSpec } from "@mcp-foundry/spec";
import { CircuitBreakerRegistry } from "../limits/circuit-breaker.js";
import { ConcurrencyLimiter } from "../limits/concurrency-limiter.js";
import { TtlCache } from "../cache/ttl-cache.js";
import { McpServerPool } from "../mcp/mcp-server-pool.js";
import { DbStatusGatedSpecRegistry } from "./db-status-gated-registry.js";
import { InMemorySpecRegistry } from "./memory-registry.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "../../../../packages/db/migrations");

function hasTestDatabase(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

const testSpec = {
  name: "Weather Lookup",
  slug: "weather-integration-test",
  description: "d",
  mcpVersion: "2025-06-18",
  tools: [],
} as unknown as ServerSpec;

/**
 * Verifies the real, un-mocked contract apps/worker's delete path depends
 * on: softDeleteServer (the exact function the "delete" job handler calls,
 * task #9) flips a row's status away from 'active', and
 * DbStatusGatedSpecRegistry — driven by that same row over a real
 * Postgres connection, not a mock — stops serving it. Requested by
 * team-lead as a completion-criteria check on top of task #9's own
 * (mocked) delete-handler tests.
 */
describe.skipIf(!hasTestDatabase())("DbStatusGatedSpecRegistry + real delete path (integration)", () => {
  let pool: Pool;
  let userId: string;

  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL!);
    const client = await pool.connect();
    try {
      await runMigrations(client, migrationsDir);
    } finally {
      client.release();
    }
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE TABLE status_events, jobs, servers, users RESTART IDENTITY CASCADE");
    userId = (await createUser(pool, { authRef: "runtime-host-integration-owner" })).id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("blocks a server once it is soft-deleted, and serves it again if somehow reactivated", async () => {
    const inner = new InMemorySpecRegistry();
    await inner.set(testSpec);
    const registry = new DbStatusGatedSpecRegistry(pool, inner);

    const { server } = await createServerFromJob(pool, {
      userId,
      name: testSpec.name,
      slug: testSpec.slug,
      mcpVersion: testSpec.mcpVersion,
      tools: [],
      idempotencyKey: "integration-hash-1",
    });

    // Not active yet ("building") — already blocked before any delete.
    expect(await registry.get(testSpec.slug)).toBeNull();

    await updateServer(pool, server.id, { status: "active", publicUrl: "https://example.com/s/weather/mcp" });
    expect(await registry.get(testSpec.slug)).toEqual(testSpec);

    // The exact call apps/worker's delete job handler makes (repos/pg-repos.ts -> softDeleteServer).
    await softDeleteServer(pool, server.id);
    expect(await registry.get(testSpec.slug)).toBeNull();
  });

  it("KNOWN GAP: a slug already resolved by McpServerPool before deletion keeps being served until invalidate() runs", async () => {
    const inner = new InMemorySpecRegistry();
    await inner.set(testSpec);
    const registry = new DbStatusGatedSpecRegistry(pool, inner);
    const pool_ = new McpServerPool({
      registry,
      toolCache: new TtlCache(),
      circuitBreakers: new CircuitBreakerRegistry({ failureThreshold: 5, cooldownMs: 30_000 }),
      concurrency: new ConcurrencyLimiter(4),
    });

    const { server } = await createServerFromJob(pool, {
      userId,
      name: testSpec.name,
      slug: testSpec.slug,
      mcpVersion: testSpec.mcpVersion,
      tools: [],
      idempotencyKey: "integration-hash-2",
    });
    await updateServer(pool, server.id, { status: "active", publicUrl: "https://example.com/s/weather/mcp" });

    // First request resolves and caches the spec while the server is active.
    expect(await pool_.buildServerForRequest(testSpec.slug)).not.toBeNull();

    await softDeleteServer(pool, server.id);

    // Gap: the pool's resolve() cache short-circuits before ever re-consulting
    // the DB-gated registry, so a deleted-but-previously-resolved slug is
    // still servable. apps/worker's LocalFileDeployer doc comment and the
    // task #9 completion report both call this out — fixing it requires a
    // cross-process invalidation channel (e.g. an admin endpoint) calling
    // pool.invalidate(slug), which is out of scope for this round.
    expect(await pool_.buildServerForRequest(testSpec.slug)).not.toBeNull();

    // Confirms invalidate() is the actual fix, once a channel to call it exists.
    pool_.invalidate(testSpec.slug);
    expect(await pool_.buildServerForRequest(testSpec.slug)).toBeNull();
  });
});
