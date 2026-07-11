import { describe, expect, it, vi } from "vitest";
import { createGuardedFetch } from "./guarded-fetch.js";

function fakeRequest() {
  return { method: "GET" as const, headers: {}, signal: new AbortController().signal };
}

describe("createGuardedFetch", () => {
  it("resolves and pins the connection for an allowed host", async () => {
    const resolveHost = vi.fn().mockResolvedValue(["93.184.216.34"]);
    const sendRequest = vi.fn().mockResolvedValue(new Response("ok"));
    const guarded = createGuardedFetch({
      allowedHosts: new Set(["api.example.com"]),
      resolveHost,
      sendRequest,
    });

    const url = new URL("https://api.example.com/v1/ping");
    await guarded(url, fakeRequest());

    expect(resolveHost).toHaveBeenCalledTimes(1);
    expect(resolveHost).toHaveBeenCalledWith("api.example.com");
    expect(sendRequest).toHaveBeenCalledWith(url, "93.184.216.34", expect.anything());
  });

  it("rejects a host that is not in the spec's own allowlist, without resolving or sending", async () => {
    const resolveHost = vi.fn();
    const sendRequest = vi.fn();
    const guarded = createGuardedFetch({
      allowedHosts: new Set(["api.example.com"]),
      resolveHost,
      sendRequest,
    });

    await expect(guarded(new URL("https://evil.example.net/x"), fakeRequest())).rejects.toThrow();
    expect(resolveHost).not.toHaveBeenCalled();
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it("rejects a host that is allowlisted by the spec but excluded from the process-wide egress allowlist", async () => {
    const resolveHost = vi.fn();
    const sendRequest = vi.fn();
    const guarded = createGuardedFetch({
      allowedHosts: new Set(["api.example.com"]),
      globalAllowlist: ["other-allowed.example.com"],
      resolveHost,
      sendRequest,
    });

    await expect(guarded(new URL("https://api.example.com/x"), fakeRequest())).rejects.toThrow();
    expect(resolveHost).not.toHaveBeenCalled();
  });

  it("allows any spec-declared host when the process-wide allowlist is empty/unset", async () => {
    const resolveHost = vi.fn().mockResolvedValue(["1.2.3.4"]);
    const sendRequest = vi.fn().mockResolvedValue(new Response("ok"));
    const guarded = createGuardedFetch({
      allowedHosts: new Set(["api.example.com"]),
      globalAllowlist: [],
      resolveHost,
      sendRequest,
    });

    await guarded(new URL("https://api.example.com/x"), fakeRequest());
    expect(sendRequest).toHaveBeenCalled();
  });

  it("propagates a resolveHost rejection (e.g. private-IP resolution) without ever sending", async () => {
    const resolveHost = vi.fn().mockRejectedValue(new Error("host resolved to a disallowed address"));
    const sendRequest = vi.fn();
    const guarded = createGuardedFetch({
      allowedHosts: new Set(["api.example.com"]),
      resolveHost,
      sendRequest,
    });

    await expect(guarded(new URL("https://api.example.com/x"), fakeRequest())).rejects.toThrow(
      "disallowed address",
    );
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it("rejects when resolveHost returns an empty address list", async () => {
    const resolveHost = vi.fn().mockResolvedValue([]);
    const sendRequest = vi.fn();
    const guarded = createGuardedFetch({ allowedHosts: new Set(["api.example.com"]), resolveHost, sendRequest });

    await expect(guarded(new URL("https://api.example.com/x"), fakeRequest())).rejects.toThrow();
    expect(sendRequest).not.toHaveBeenCalled();
  });

  it("treats hostnames case-insensitively against the allowlist", async () => {
    const resolveHost = vi.fn().mockResolvedValue(["1.2.3.4"]);
    const sendRequest = vi.fn().mockResolvedValue(new Response("ok"));
    const guarded = createGuardedFetch({
      allowedHosts: new Set(["api.example.com"]),
      resolveHost,
      sendRequest,
    });

    await guarded(new URL("https://API.EXAMPLE.COM/x"), fakeRequest());
    expect(sendRequest).toHaveBeenCalled();
  });
});
