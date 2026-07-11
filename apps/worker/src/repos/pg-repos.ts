import { createServerFromJob, findServerById, softDeleteServer, updateServer, type Pool } from "@mcp-foundry/db";
import type { WorkerRepos } from "./types.js";

/** Postgres-backed WorkerRepos, composed from @mcp-foundry/db's existing repo functions. */
export function createPgWorkerRepos(pool: Pool): WorkerRepos {
  return {
    servers: {
      createFromJob: (input) => createServerFromJob(pool, input),
      findById: (id) => findServerById(pool, id),
      update: (id, patch) => updateServer(pool, id, patch),
      softDelete: (id) => softDeleteServer(pool, id),
    },
  };
}
