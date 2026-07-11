import { describe, expect, it, vi } from "vitest";
import type { ResolveHost } from "./resolve-host.js";
import type { SendPinnedRequest } from "./send-pinned-request.js";
import { createGuardedOpenApiFetcher } from "./guarded-openapi-fetch.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("createGuardedOpenApiFetcher", () => {
  it("fetches, validates, and JSON-parses a normal public https OpenAPI URL", async () => {
    const resolveHost: ResolveHost = vi.fn().mockResolvedValue(["93.184.216.34"]);
    const sendRequest: SendPinnedRequest = vi.fn().mockResolvedValue(jsonResponse({ openapi: "3.0.0" }));
    const fetcher = createGuardedOpenApiFetcher({ resolveHost, sendRequest });

    const doc = await fetcher("https://api.example.com/openapi.json");

    expect(doc).toEqual({ openapi: "3.0.0" });
    expect(resolveHost).toHaveBeenCalledWith("api.example.com");
    expect(sendRequest).toHaveBeenCalledWith(
      new URL("https://api.example.com/openapi.json"),
      "93.184.216.34",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects a non-https URL without ever resolving or sending", async () => {
    const resolveHost = vi.fn();
    const sendRequest = vi.fn();
    const fetcher = createGuardedOpenApiFetcher({ resolveHost, sendRequest });

    await expect(fetcher("http://api.example.com/openapi.json")).rejects.toThrow(/https/);
    expect(resolveHost).not.toHaveBeenCalled();
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it("rejects a malformed URL", async () => {
    const fetcher = createGuardedOpenApiFetcher();
    await expect(fetcher("not a url")).rejects.toThrow(/not a valid URL/);
  });

  it("blocks 'localhost' using the real (unmocked) resolveHost + isDisallowedAddress — no network access needed since it resolves via /etc/hosts", async () => {
    const sendRequest = vi.fn();
    const fetcher = createGuardedOpenApiFetcher({ sendRequest }); // resolveHost left as the real defaultResolveHost

    await expect(fetcher("https://localhost/openapi.json")).rejects.toThrow(/disallowed address/);
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it("blocks a DNS-rebinding scenario where only a later resolved address is disallowed", async () => {
    const resolveHost: ResolveHost = vi.fn().mockRejectedValue(new Error(`host "x" resolved to a disallowed address`));
    const sendRequest = vi.fn();
    const fetcher = createGuardedOpenApiFetcher({ resolveHost, sendRequest });

    await expect(fetcher("https://api.example.com/openapi.json")).rejects.toThrow(/disallowed address/);
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it("enforces EGRESS_ALLOWLIST membership when one is configured", async () => {
    const resolveHost = vi.fn();
    const sendRequest = vi.fn();
    const fetcher = createGuardedOpenApiFetcher({
      globalAllowlist: ["allowed.example.com"],
      resolveHost,
      sendRequest,
    });

    await expect(fetcher("https://not-allowed.example.com/openapi.json")).rejects.toThrow(/egress allowlist/);
    expect(resolveHost).not.toHaveBeenCalled();
  });

  it("times out a hanging upstream rather than waiting forever", async () => {
    const resolveHost: ResolveHost = vi.fn().mockResolvedValue(["93.184.216.34"]);
    const sendRequest: SendPinnedRequest = (_url, _ip, request) =>
      new Promise((_resolve, reject) => {
        request.signal.addEventListener("abort", () => reject(new Error("aborted")));
      });
    const fetcher = createGuardedOpenApiFetcher({ resolveHost, sendRequest, timeoutMs: 20 });

    await expect(fetcher("https://slow.example.com/openapi.json")).rejects.toThrow();
  });

  it("caps the response body size rather than buffering an unbounded stream", async () => {
    const resolveHost: ResolveHost = vi.fn().mockResolvedValue(["93.184.216.34"]);
    const hugeBody = "x".repeat(1024);
    const sendRequest: SendPinnedRequest = vi.fn().mockResolvedValue(new Response(hugeBody, { status: 200 }));
    const fetcher = createGuardedOpenApiFetcher({ resolveHost, sendRequest, maxResponseBytes: 16 });

    await expect(fetcher("https://api.example.com/openapi.json")).rejects.toThrow(/exceeded/);
  });

  it("does not follow a redirect response — surfaces it as a failure instead", async () => {
    const resolveHost: ResolveHost = vi.fn().mockResolvedValue(["93.184.216.34"]);
    const sendRequest: SendPinnedRequest = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 302, headers: { location: "https://evil.example.net/x" } }));
    const fetcher = createGuardedOpenApiFetcher({ resolveHost, sendRequest });

    await expect(fetcher("https://api.example.com/openapi.json")).rejects.toThrow(/302/);
    expect(sendRequest).toHaveBeenCalledTimes(1); // never chased the redirect target
  });

  it("rejects a non-JSON response body", async () => {
    const resolveHost: ResolveHost = vi.fn().mockResolvedValue(["93.184.216.34"]);
    const sendRequest: SendPinnedRequest = vi.fn().mockResolvedValue(new Response("<html>not json</html>", { status: 200 }));
    const fetcher = createGuardedOpenApiFetcher({ resolveHost, sendRequest });

    await expect(fetcher("https://api.example.com/openapi.json")).rejects.toThrow(/not valid JSON/);
  });
});
