import {
  PgQueue,
  createUser,
  findJobById,
  findServerById,
  findUserByAuthRef,
  listServersByUser,
  type Pool,
} from "@mcp-foundry/db";
import type { CreatorRepos } from "./types.js";

/** Postgres-backed CreatorRepos, composed from @mcp-foundry/db's existing repo functions. */
export function createPgRepos(pool: Pool): CreatorRepos {
  return {
    users: {
      async findOrCreateByAuthRef(authRef) {
        const existing = await findUserByAuthRef(pool, authRef);
        if (existing) return existing;
        return createUser(pool, { authRef });
      },
    },
    jobs: {
      findById: (id) => findJobById(pool, id),
    },
    servers: {
      findById: (id) => findServerById(pool, id),
      listByUser: (userId, options) => listServersByUser(pool, userId, options),
    },
    queue: new PgQueue(pool),
  };
}
