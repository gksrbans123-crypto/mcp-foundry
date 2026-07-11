import { describe, expect, it } from "vitest";
import { jobSchema, serverSchema } from "./schemas.js";

describe("jobSchema", () => {
  it("validates a well-formed queued create job", () => {
    const job = {
      id: "job_1",
      userId: "user_1",
      serverId: null,
      type: "create",
      input: { nl: "make me a weather server" },
      parsedSpec: null,
      stage: "queued",
      status: "queued",
      error: null,
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      idempotencyKey: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(jobSchema.parse(job)).toEqual(job);
  });

  it("rejects an unknown stage", () => {
    const job = {
      id: "job_1",
      userId: "user_1",
      serverId: null,
      type: "create",
      input: { nl: "make me a weather server" },
      parsedSpec: null,
      stage: "not-a-real-stage",
      status: "queued",
      error: null,
      attempts: 0,
      lockedAt: null,
      lockedBy: null,
      idempotencyKey: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(() => jobSchema.parse(job)).toThrow();
  });
});

describe("serverSchema", () => {
  it("validates a well-formed building server", () => {
    const server = {
      id: "srv_1",
      userId: "user_1",
      name: "weather-bot",
      slug: "weather-bot",
      publicUrl: null,
      mcpVersion: "2025-06-18",
      status: "building",
      tools: [],
      probeResult: null,
      deployRef: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    expect(serverSchema.parse(server)).toEqual(server);
  });
});
