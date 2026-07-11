import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import type { FetchGuardRequest } from "@mcp-foundry/spec";

export type SendPinnedRequest = (url: URL, pinnedIp: string, request: FetchGuardRequest) => Promise<Response>;

function toWebResponse(res: http.IncomingMessage): Response {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) headers.append(key, v);
  }
  const body = Readable.toWeb(res) as ReadableStream<Uint8Array>;
  return new Response(body, {
    status: res.statusCode ?? 502,
    statusText: res.statusMessage,
    headers,
  });
}

/**
 * Sends the actual HTTP(S) request, but pins the TCP connection to
 * `pinnedIp` (already DNS-resolved and validated by resolve-host.ts)
 * instead of letting the client library re-resolve `url.hostname` — this
 * is the half of the DNS-rebinding defense that closes the TOCTOU window.
 *
 * Ported from apps/runtime-host/src/egress/send-pinned-request.ts — see
 * the duplication note in ip-range-check.ts.
 */
export const defaultSendPinnedRequest: SendPinnedRequest = (url, pinnedIp, request) => {
  return new Promise<Response>((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const defaultPort = url.protocol === "https:" ? 443 : 80;
    const pinnedFamily = net.isIP(pinnedIp);

    const clientRequest = transport.request(
      {
        hostname: url.hostname,
        port: url.port ? Number(url.port) : defaultPort,
        path: `${url.pathname}${url.search}`,
        method: request.method,
        headers: request.headers,
        lookup: (_hostname, options, callback) => {
          if (typeof options === "object" && options !== null && "all" in options && options.all) {
            callback(null, [{ address: pinnedIp, family: pinnedFamily }]);
          } else {
            callback(null, pinnedIp, pinnedFamily);
          }
        },
      },
      (res) => resolve(toWebResponse(res)),
    );

    clientRequest.on("error", reject);
    request.signal.addEventListener("abort", () => clientRequest.destroy(new Error("aborted")));

    if (request.body !== undefined) clientRequest.write(request.body);
    clientRequest.end();
  });
};
