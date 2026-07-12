import type { Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { createSignedOwnerTokenAuthN } from "./auth/signed-owner-token.js";
import { createMemoryRepos } from "./repos/memory-repos.js";

/**
 * HIGH-2 regression test: before the fix, a caller that never presents
 * X-Owner-Token got a brand-new user + token (and therefore a brand-new,
 * untouched rate-limit bucket keyed by that userId) on every single
 * request — completely defeating the mutate limiter and allowing unlimited
 * create_mcp_server calls (unbounded LLM cost / queue writes / users-table
 * growth) from a single anonymous source. This drives the real HTTP/MCP
 * surface end to end (no mocks) to prove the fix: every anonymous request
 * shares one IP-derived rate-limit key, so the mutate budget is shared
 * across identities, not reset by minting a new one.
 */
describe("HIGH-2: anonymous mutate calls share one rate-limit budget per address", () => {
  let httpServer: HttpServer;
  let mcpUrl: string;

  beforeAll(async () => {
    const repos = createMemoryRepos();
    const authn = createSignedOwnerTokenAuthN({ secret: "security-fixes-test-secret", users: repos.users });
    const app = createApp({ authn, repos, dashboardBaseUrl: "http://localhost:3000" });

    httpServer = await new Promise<HttpServer>((resolve) => {
      const server = app.listen(0, () => resolve(server));
    });
    const { port } = httpServer.address() as AddressInfo;
    mcpUrl = `http://127.0.0.1:${port}/mcp`;
  });

  afterAll(() => {
    httpServer.close();
  });

  async function callCreateWithNoToken(): Promise<{ isError: boolean; text: string }> {
    const client = new Client({ name: "anon-attacker", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl));
    await client.connect(transport);
    const result = await client.callTool({
      name: "create_mcp_server",
      arguments: { spec_text: `spec from a fresh anonymous identity` },
    });
    await client.close();
    const content = result.content as Array<{ type: string; text?: string }>;
    return { isError: Boolean(result.isError), text: content.find((c) => c.type === "text")?.text ?? "" };
  }

  it("throttles repeated anonymous create_mcp_server calls even though each one mints a new user", async () => {
    // All 3 requests present no token, so each one auto-provisions its own
    // brand-new user — the old, vulnerable behavior would let every single
    // one of these (and any number beyond) succeed, since each had a fresh,
    // never-touched per-user bucket.
    for (let i = 0; i < 3; i++) {
      const result = await callCreateWithNoToken();
      expect(result.isError).toBe(false);
      expect(result.text).toContain("New owner token issued"); // proves a fresh identity really was minted each time
    }

    // The 4th anonymous mutate call — from a 4th distinct, never-before-seen
    // user — must still be rejected, because the mutate limiter is keyed by
    // client address for unauthenticated requests, not by the ever-changing
    // userId.
    const fourth = await callCreateWithNoToken();
    expect(fourth.isError).toBe(true);
    expect(fourth.text).toMatch(/Rate limit exceeded/);
  });

  it("does not throttle an authenticated caller's mutate budget just because anonymous traffic shares its address", async () => {
    // The loopback address's anonymous mutate bucket is already exhausted by
    // the previous test (same process, same describe block) — an
    // authenticated user reusing their own saved token must be unaffected,
    // since their calls are keyed by their stable userId, not the address.
    // Any non-empty token is a stable namespace identity (custom-header auth),
    // so the test presents its own saved value directly — no bootstrap call
    // needed (read-only tools no longer announce their auto-issued tokens).
    const token = "real-user-saved-token.for-rate-limit-test";

    const client = new Client({ name: "real-user", version: "0.0.1" });
    const transport = new StreamableHTTPClientTransport(new URL(mcpUrl), {
      requestInit: { headers: { "X-Owner-Token": token } },
    });
    await client.connect(transport);
    const result = await client.callTool({
      name: "create_mcp_server",
      arguments: { spec_text: "a real authenticated user's request" },
    });
    await client.close();

    expect(result.isError).toBeFalsy();
  });
});
