import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createRateLimiters } from "../rate-limit/token-bucket.js";
import { createMemoryRepos } from "../repos/memory-repos.js";
import type { ToolContext } from "./context.js";
import { createCreateMcpServerHandler, createMcpServerInputShape } from "./create-mcp-server.js";

const createMcpServerInputSchema = z.object(createMcpServerInputShape);

function buildCtx(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    userId: "user-1",
    token: "test-token",
    rateLimitKey: "user-1",
    repos: createMemoryRepos(),
    rateLimiters: createRateLimiters(),
    dashboardBaseUrl: "http://localhost:3000",
    ...overrides,
  };
}

function extractJobId(markdown: string): string {
  const match = markdown.match(/\*\*작업 ID:\*\* `([^`]+)`/);
  if (!match) throw new Error(`no Job ID found in response markdown: ${markdown}`);
  return match[1]!;
}

describe("create_mcp_server handler", () => {
  it("enqueues a job and returns immediately with job id, status URL, and dashboard URL", async () => {
    const ctx = buildCtx();
    const handler = createCreateMcpServerHandler(ctx);

    const result = await handler({ spec_text: "A tool that echoes back the input text." });
    const text = result.content[0].text;

    expect(result.isError).toBeUndefined();
    expect(text).toMatch(/만들고 있어요/);
    expect(text).toContain("http://localhost:3000/jobs/");
    expect(text).toContain("http://localhost:3000/servers?token=test-token");
    expect(text).toMatch(/get_job_status/);

    const job = await ctx.repos.jobs.findById(extractJobId(text));
    expect(job).not.toBeNull();
    expect(job?.stage).toBe("queued");
    expect(job?.status).toBe("queued");
    expect(job?.type).toBe("create");
    expect(job?.userId).toBe("user-1");
    expect(job?.input.nl).toBe("A tool that echoes back the input text.");
  });

  it("passes the optional name through as its own job.input.name field (not folded into nl)", async () => {
    const ctx = buildCtx();
    const handler = createCreateMcpServerHandler(ctx);

    const result = await handler({ spec_text: "Wraps the weather API.", name: "Weather Bot" });
    const job = await ctx.repos.jobs.findById(extractJobId(result.content[0].text));

    expect(job?.input.name).toBe("Weather Bot");
    expect(job?.input.nl).toBe("Wraps the weather API.");
  });

  it("passes openapi_url and endpoint_descriptor through to the job input", async () => {
    const ctx = buildCtx();
    const handler = createCreateMcpServerHandler(ctx);

    const result = await handler({
      spec_text: "Wraps an OpenAPI-described API.",
      openapi_url: "https://example.com/openapi.json",
      endpoint_descriptor: { method: "GET", url: "https://example.com/api" },
    });
    const job = await ctx.repos.jobs.findById(extractJobId(result.content[0].text));

    expect(job?.input.openapiUrl).toBe("https://example.com/openapi.json");
    expect(job?.input.endpointDescriptor).toEqual({ method: "GET", url: "https://example.com/api" });
  });

  it("rejects once the mutate rate limit (3/min) is exhausted", async () => {
    const ctx = buildCtx();
    const handler = createCreateMcpServerHandler(ctx);

    for (let i = 0; i < 3; i++) {
      const result = await handler({ spec_text: `spec ${i}` });
      expect(result.isError).toBeUndefined();
    }

    const fourth = await handler({ spec_text: "spec 4" });
    expect(fourth.isError).toBe(true);
    expect(fourth.content[0].text).toMatch(/Rate limit exceeded/);
  });

  it("owns the job by the owner_token identity and suppresses the new-token notice", async () => {
    const ctx = buildCtx({ isNewToken: true, verifyToken: async (token) => `user-of-${token}` });
    const handler = createCreateMcpServerHandler(ctx);

    const result = await handler({ spec_text: "spec", owner_token: "tok.abc" });
    const job = await ctx.repos.jobs.findById(extractJobId(result.content[0].text));

    // Conversation-carried identity wins over this request's auto-issued one.
    expect(job?.userId).toBe("user-of-tok.abc");
    expect(result.content[0].text).not.toContain("New owner token issued");
    // Dashboard links must carry the owner token so they open the right account.
    expect(result.content[0].text).toContain("token=tok.abc");
  });

  it("prepends the owner-token notice when ctx.isNewToken is set", async () => {
    const ctx = buildCtx({ token: "brand-new-token", isNewToken: true });
    const handler = createCreateMcpServerHandler(ctx);

    const result = await handler({ spec_text: "spec" });

    expect(result.content[0].text).toContain("New owner token issued");
    expect(result.content[0].text).toContain("brand-new-token");
  });
});

describe("createMcpServerInputSchema (security review HIGH-1 defense in depth)", () => {
  it("accepts an https openapi_url", () => {
    const result = createMcpServerInputSchema.safeParse({
      spec_text: "spec",
      openapi_url: "https://api.example.com/openapi.json",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-https openapi_url", () => {
    const result = createMcpServerInputSchema.safeParse({
      spec_text: "spec",
      openapi_url: "http://api.example.com/openapi.json",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a request with no openapi_url at all", () => {
    const result = createMcpServerInputSchema.safeParse({ spec_text: "spec" });
    expect(result.success).toBe(true);
  });
});
