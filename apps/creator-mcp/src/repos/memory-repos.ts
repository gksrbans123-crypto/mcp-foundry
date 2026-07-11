import { randomUUID } from "node:crypto";
import type { Job, Server, User } from "@mcp-foundry/shared";
import type { CreatorRepos } from "./types.js";

export interface MemoryRepos extends CreatorRepos {
  /** Test/demo seeding hooks — memory mode has no worker to populate these on its own. */
  seedServer(server: Server): void;
  seedJob(job: Job): void;
}

/**
 * In-memory fallback so apps/creator-mcp can start (and be unit-tested)
 * without a live Postgres (plan task #5 completion criterion: "DB 미연결
 * 시에도 서버가 뜨도록"). Not durable across process restarts.
 */
export function createMemoryRepos(): MemoryRepos {
  const users = new Map<string, User>();
  const jobs = new Map<string, Job>();
  const servers = new Map<string, Server>();

  return {
    users: {
      async findOrCreateByAuthRef(authRef) {
        const existing = [...users.values()].find((user) => user.authRef === authRef);
        if (existing) return existing;
        const user: User = { id: randomUUID(), authRef, createdAt: new Date().toISOString() };
        users.set(user.id, user);
        return user;
      },
    },
    jobs: {
      async findById(id) {
        return jobs.get(id) ?? null;
      },
    },
    servers: {
      async findById(id) {
        return servers.get(id) ?? null;
      },
      async listByUser(userId, options) {
        const owned = [...servers.values()].filter((server) => server.userId === userId);
        const statusFilter = options?.status;
        if (!statusFilter || statusFilter.length === 0) return owned;
        return owned.filter((server) => statusFilter.includes(server.status));
      },
    },
    queue: {
      async enqueue(input) {
        const now = new Date().toISOString();
        const job: Job = {
          id: randomUUID(),
          userId: input.userId,
          serverId: input.serverId ?? null,
          type: input.type,
          input: input.input,
          parsedSpec: null,
          stage: "queued",
          status: "queued",
          error: null,
          attempts: 0,
          lockedAt: null,
          lockedBy: null,
          idempotencyKey: null,
          createdAt: now,
          updatedAt: now,
        };
        jobs.set(job.id, job);
        return job;
      },
    },
    seedServer(server) {
      servers.set(server.id, server);
    },
    seedJob(job) {
      jobs.set(job.id, job);
    },
  };
}
