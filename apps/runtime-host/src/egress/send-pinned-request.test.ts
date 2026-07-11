import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { defaultSendPinnedRequest } from "./send-pinned-request.js";

async function startTestServer(
  handler: (req: http.IncomingMessage, res: http.ServerResponse) => void,
): Promise<{ port: number; close: () => Promise<void> }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { port, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

describe("defaultSendPinnedRequest", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("connects to the pinned IP while preserving the original Host header", async () => {
    let receivedHost: string | undefined;
    let receivedPath: string | undefined;
    const { port, close } = await startTestServer((req, res) => {
      receivedHost = req.headers.host;
      receivedPath = req.url;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
    });
    cleanup = close;

    // A hostname that does not actually resolve anywhere — proving the
    // request only succeeds because the connection is pinned to 127.0.0.1,
    // not because "not-a-real-host.invalid" itself resolved.
    const url = new URL(`http://not-a-real-host.invalid:${port}/v1/ping?x=1`);
    const response = await defaultSendPinnedRequest(url, "127.0.0.1", {
      method: "GET",
      headers: {},
      signal: new AbortController().signal,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(receivedHost).toBe(`not-a-real-host.invalid:${port}`);
    expect(receivedPath).toBe("/v1/ping?x=1");
  });

  it("sends the request body and content-type header for a POST", async () => {
    let receivedBody = "";
    const { port, close } = await startTestServer((req, res) => {
      req.on("data", (chunk) => (receivedBody += chunk));
      req.on("end", () => {
        res.writeHead(201);
        res.end("created");
      });
    });
    cleanup = close;

    const url = new URL(`http://pinned.invalid:${port}/v1/search`);
    const response = await defaultSendPinnedRequest(url, "127.0.0.1", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ q: "weather" }),
      signal: new AbortController().signal,
    });

    expect(response.status).toBe(201);
    expect(receivedBody).toBe(JSON.stringify({ q: "weather" }));
  });

  it("rejects when the request is aborted before the server responds", async () => {
    const { port, close } = await startTestServer(() => {
      // Never respond, so the abort is what settles the promise.
    });
    cleanup = close;

    const controller = new AbortController();
    const url = new URL(`http://pinned.invalid:${port}/v1/slow`);
    const pending = defaultSendPinnedRequest(url, "127.0.0.1", {
      method: "GET",
      headers: {},
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toBeTruthy();
  });

  it("rejects when the pinned address refuses the connection", async () => {
    // Port 1 on loopback should have nothing listening.
    const url = new URL("http://pinned.invalid:1/v1/ping");
    await expect(
      defaultSendPinnedRequest(url, "127.0.0.1", { method: "GET", headers: {}, signal: new AbortController().signal }),
    ).rejects.toBeTruthy();
  });
});
