import type { EnqueueJobInput } from "@mcp-foundry/db";
import type { Job, Server, ServerStatus, User } from "@mcp-foundry/shared";

export interface CreatorUserRepo {
  findOrCreateByAuthRef(authRef: string): Promise<User>;
}

export interface CreatorJobRepo {
  findById(id: string): Promise<Job | null>;
}

export interface ListServersOptions {
  status?: ServerStatus[];
}

export interface CreatorServerRepo {
  findById(id: string): Promise<Server | null>;
  listByUser(userId: string, options?: ListServersOptions): Promise<Server[]>;
}

/**
 * Narrower than @mcp-foundry/db's full `Queue` interface — apps/creator-mcp
 * only ever enqueues (plan P3 principle: create/refine/delete enqueue and
 * return immediately). `claim`/`complete`/`fail` are apps/worker's concerns.
 */
export interface JobEnqueuer {
  enqueue(input: EnqueueJobInput): Promise<Job>;
}

export interface CreatorRepos {
  users: CreatorUserRepo;
  jobs: CreatorJobRepo;
  servers: CreatorServerRepo;
  queue: JobEnqueuer;
}
