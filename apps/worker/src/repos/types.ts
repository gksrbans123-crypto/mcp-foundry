import type { CreateServerFromJobInput, CreateServerFromJobResult, UpdateServerPatch } from "@mcp-foundry/db";
import type { Server } from "@mcp-foundry/shared";

/**
 * Narrow, injectable slice of @mcp-foundry/db's server-repo functions that
 * the stage machine needs — mirrors apps/creator-mcp's CreatorRepos pattern
 * so stage-handler unit tests can run against an in-memory fake instead of
 * a real Postgres (see memory-repos.ts).
 */
export interface WorkerServerRepo {
  createFromJob(input: CreateServerFromJobInput): Promise<CreateServerFromJobResult>;
  findById(id: string): Promise<Server | null>;
  update(id: string, patch: UpdateServerPatch): Promise<Server>;
  softDelete(id: string): Promise<Server>;
}

export interface WorkerRepos {
  servers: WorkerServerRepo;
}
