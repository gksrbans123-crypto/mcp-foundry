import { describe, expect, it } from "vitest";
import { buildJobStatusUrl, buildServerDetailUrl, buildServersUrl } from "./urls.js";

// These builders must stay byte-compatible with apps/dashboard's actual
// routes (src/app/servers/page.tsx, src/app/servers/[serverId]/page.tsx,
// src/app/jobs/[jobId]/page.tsx) — all three read the owner token from a
// `?token=` query param. A mismatch here means every dashboard/status link
// creator-mcp hands back to a client is silently broken.
describe("dashboard URL builders", () => {
  it("buildServersUrl matches apps/dashboard's /servers?token= contract", () => {
    expect(buildServersUrl("http://localhost:3000", "abc.def")).toBe(
      "http://localhost:3000/servers?token=abc.def",
    );
  });

  it("buildServerDetailUrl matches apps/dashboard's /servers/:serverId?token= contract", () => {
    expect(buildServerDetailUrl("http://localhost:3000", "abc.def", "server-1")).toBe(
      "http://localhost:3000/servers/server-1?token=abc.def",
    );
  });

  it("buildJobStatusUrl matches apps/dashboard's /jobs/:jobId?token= contract", () => {
    expect(buildJobStatusUrl("http://localhost:3000", "abc.def", "job-1")).toBe(
      "http://localhost:3000/jobs/job-1?token=abc.def",
    );
  });

  it("URL-encodes tokens/ids that need it", () => {
    const url = buildServersUrl("http://localhost:3000", "has space&and=chars");
    expect(url).toBe("http://localhost:3000/servers?token=has+space%26and%3Dchars");
  });

  it("works against a non-localhost base URL (production-shaped)", () => {
    expect(buildServersUrl("https://dashboard.example.com", "tok")).toBe(
      "https://dashboard.example.com/servers?token=tok",
    );
  });
});
