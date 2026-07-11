import { randomUUID } from "node:crypto";
import type { CreateServerFromJobInput, CreateServerFromJobResult, UpdateServerPatch } from "@mcp-foundry/db";
import type { Server } from "@mcp-foundry/shared";
import type { WorkerRepos } from "./types.js";

/**
 * In-memory WorkerRepos for fast, hermetic stage-handler unit tests —
 * replicates the R5 idempotency semantics of @mcp-foundry/db's
 * createServerFromJob (same idempotencyKey reuses the existing row) without
 * a real Postgres. Mirrors apps/creator-mcp's memory-repos.ts pattern.
 */
export function createMemoryWorkerRepos(): WorkerRepos {
  const byId = new Map<string, Server>();
  const byIdempotencyKey = new Map<string, string>();

  return {
    servers: {
      async createFromJob(input: CreateServerFromJobInput): Promise<CreateServerFromJobResult> {
        const existingId = byIdempotencyKey.get(input.idempotencyKey);
        if (existingId) {
          const server = byId.get(existingId);
          if (server) return { server, alreadyExisted: true };
        }

        const now = new Date().toISOString();
        const server: Server = {
          id: randomUUID(),
          userId: input.userId,
          name: input.name,
          slug: input.slug,
          publicUrl: null,
          mcpVersion: input.mcpVersion,
          status: "building",
          tools: input.tools,
          probeResult: null,
          deployRef: null,
          createdAt: now,
          updatedAt: now,
        };
        byId.set(server.id, server);
        byIdempotencyKey.set(input.idempotencyKey, server.id);
        return { server, alreadyExisted: false };
      },

      async findById(id: string): Promise<Server | null> {
        return byId.get(id) ?? null;
      },

      async update(id: string, patch: UpdateServerPatch): Promise<Server> {
        const existing = byId.get(id);
        if (!existing) throw new Error(`update: server ${id} not found`);
        const updated: Server = {
          ...existing,
          ...("name" in patch && patch.name !== undefined ? { name: patch.name } : {}),
          ...("publicUrl" in patch ? { publicUrl: patch.publicUrl ?? null } : {}),
          ...("status" in patch && patch.status !== undefined ? { status: patch.status } : {}),
          ...("tools" in patch && patch.tools !== undefined ? { tools: patch.tools } : {}),
          ...("probeResult" in patch ? { probeResult: patch.probeResult ?? null } : {}),
          ...("deployRef" in patch ? { deployRef: patch.deployRef ?? null } : {}),
          updatedAt: new Date().toISOString(),
        };
        byId.set(id, updated);
        return updated;
      },

      async softDelete(id: string): Promise<Server> {
        const existing = byId.get(id);
        if (!existing) throw new Error(`softDelete: server ${id} not found`);
        if (existing.status === "deleted") return existing;
        const updated: Server = { ...existing, status: "deleted", updatedAt: new Date().toISOString() };
        byId.set(id, updated);
        return updated;
      },
    },
  };
}
