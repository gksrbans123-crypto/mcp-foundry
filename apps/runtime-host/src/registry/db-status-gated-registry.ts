import { findServerBySlug, type Queryable } from "@mcp-foundry/db";
import type { ServerSpec } from "@mcp-foundry/spec";
import type { SpecRegistry } from "./types.js";

/**
 * Composite registry for when a database is configured (task #4: "DB
 * 구현은 serverRepo 연동").
 *
 * KNOWN GAP, flagged for whoever builds apps/worker (task #9, the
 * Deployer): packages/db's `servers.tools` column is a `ServerToolSummary[]`
 * (name + description only, for dashboard listing) — there is currently no
 * column holding the full executable ServerSpec (request/response mappings,
 * annotations, cacheTtlSeconds, etc.) that this runtime actually needs to
 * interpret a tool call. Until a follow-up adds that (e.g. a `full_spec`
 * jsonb column on `servers`, or reading `jobs.parsed_spec` for the job that
 * produced the deployment), this class uses the DB purely as the
 * tenant/status gate — "is `slug` a currently active, non-deleted server?"
 * — and delegates the actual spec bytes to an injected inner registry
 * (typically FileSpecRegistry, since a deployer can write there without any
 * new protocol). This still buys a real safety property today: even if
 * stale spec bytes remain in the inner registry, a server that has been
 * deleted or is still `building`/`failed` is never served.
 */
export class DbStatusGatedSpecRegistry implements SpecRegistry {
  constructor(
    private readonly db: Queryable,
    private readonly inner: SpecRegistry,
  ) {}

  async get(slug: string): Promise<ServerSpec | null> {
    const server = await findServerBySlug(this.db, slug);
    if (!server || server.status !== "active") return null;
    return this.inner.get(slug);
  }

  async set(spec: ServerSpec): Promise<void> {
    await this.inner.set(spec);
  }
}
