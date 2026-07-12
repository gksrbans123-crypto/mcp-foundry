// All-in-one entrypoint for MCP Foundry (엠씨피 파운드리).
//
// Runs the whole backend inside a single container behind one public port:
//   - runs DB migrations once (fails fast if the schema can't be applied)
//   - spawns creator-mcp, worker, runtime-host, dashboard as child processes
//   - reverse-proxies the single public $PORT to them by path:
//       POST/GET /mcp        -> creator-mcp   (the URL you register on PlayMCP)
//       /s/{slug}/mcp        -> runtime-host  (generated servers live here)
//       /healthz             -> runtime-host
//       everything else      -> dashboard     (management UI, PlayMCP-style)
//
// Postgres is external: set DATABASE_URL to a managed instance. The worker and
// runtime-host share SPEC_STORE_DIR on the same container filesystem, so no
// volume wiring is needed here.
//
// Dependency-free on purpose: only Node built-ins, so nothing new enters the
// lockfile or the image.

import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { mkdirSync, existsSync } from "node:fs";

const PUBLIC_PORT = Number(process.env.PORT ?? 8080);
const CREATOR_PORT = Number(process.env.CREATOR_PORT ?? 3001);
const RUNTIME_PORT = Number(process.env.RUNTIME_PORT ?? 3002);
const DASHBOARD_PORT = Number(process.env.DASHBOARD_PORT ?? 3000);
const SPEC_STORE_DIR = process.env.SPEC_STORE_DIR ?? "/data/specs";

// The dashboard is optional: the backend-only image (PlayMCP submission) doesn't
// build it, so `apps/dashboard/.next` is absent and we skip it. Set
// SERVE_DASHBOARD=0 to force it off even when built.
const DASHBOARD_ENABLED = process.env.SERVE_DASHBOARD !== "0" && existsSync("apps/dashboard/.next");

// EGRESS_ALLOWLIST defaults to empty = no extra host restriction, so a
// generated server may reach ANY public host its spec declares (LLM-inferred
// servers work out of the box, not just the weather/search/currency templates).
// The SSRF / private-IP / DNS-rebinding guards in each service still block
// internal/metadata addresses regardless. Set EGRESS_ALLOWLIST to a
// comma-separated host list to re-narrow what generated servers may reach.

// Fail fast on the two values that have no safe default.
function requireEnv() {
  const problems = [];
  if (!process.env.DATABASE_URL) problems.push("DATABASE_URL (managed Postgres connection string)");
  const secret = process.env.OWNER_TOKEN_SECRET ?? "";
  if (secret.length < 32)
    problems.push("OWNER_TOKEN_SECRET (>=32 chars — `openssl rand -base64 32`)");
  if (problems.length) {
    log("start", `missing required environment:\n  - ${problems.join("\n  - ")}\n`);
    process.exit(1);
  }
}

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? `http://localhost:${PUBLIC_PORT}`;

// Internal services bind these ports; the reverse proxy owns the public $PORT.
// PUBLIC_BASE_URL / DASHBOARD_PUBLIC_URL default to localhost for a plain
// `docker run` and MUST be set to the container's external URL in production so
// generated-server and dashboard links point at the public domain.
const childEnv = {
  ...process.env,
  CREATOR_PORT: String(CREATOR_PORT),
  RUNTIME_PORT: String(RUNTIME_PORT),
  DASHBOARD_PORT: String(DASHBOARD_PORT),
  SPEC_STORE_DIR,
  PUBLIC_BASE_URL,
  DASHBOARD_PUBLIC_URL: process.env.DASHBOARD_PUBLIC_URL ?? PUBLIC_BASE_URL,
  // Required by the shared env schema (loadEnv). A placeholder lets the
  // template-only path run; real NL->spec generation needs a genuine key.
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "set-me-for-llm-generation",
  EGRESS_ALLOWLIST: process.env.EGRESS_ALLOWLIST ?? "",
  NODE_ENV: "production",
};

const children = [];
let shuttingDown = false;

function log(name, line) {
  process.stdout.write(`[${name}] ${line}`);
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 2000).unref();
}

// Spawn a long-running child; if any critical child dies, take the whole
// container down so the platform restarts it (avoids a half-dead deploy).
function start(name, command, args, opts = {}) {
  const child = spawn(command, args, {
    env: childEnv,
    cwd: opts.cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (b) => log(name, b.toString()));
  child.stderr.on("data", (b) => log(name, b.toString()));
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    log(name, `exited (code=${code} signal=${signal}) — shutting down container\n`);
    shutdown(1);
  });
  children.push(child);
  return child;
}

// Run DB migrations to completion before starting any service.
function runMigrations() {
  return new Promise((resolve, reject) => {
    log("migrate", "applying database migrations...\n");
    const m = spawn("./node_modules/.bin/tsx", ["packages/db/scripts/migrate.ts"], {
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });
    m.stdout.on("data", (b) => log("migrate", b.toString()));
    m.stderr.on("data", (b) => log("migrate", b.toString()));
    m.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`migrations failed (exit ${code})`))
    );
  });
}

// Wait until an internal service is accepting TCP connections (best-effort).
function waitForPort(port, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tryOnce = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() > deadline) resolve(false);
        else setTimeout(tryOnce, 500);
      });
    };
    tryOnce();
  });
}

function targetFor(url) {
  if (url === "/mcp" || url.startsWith("/mcp/") || url.startsWith("/mcp?")) return CREATOR_PORT;
  // Diagnostic endpoint (creator-mcp serves it only when DEBUG_LOG_HEADERS=1;
  // otherwise creator-mcp has no such route and this 404s harmlessly).
  if (url.startsWith("/debug/")) return CREATOR_PORT;
  if (url.startsWith("/s/") || url === "/healthz" || url.startsWith("/healthz?")) return RUNTIME_PORT;
  return DASHBOARD_PORT;
}

// Minimal streaming reverse proxy (supports MCP Streamable HTTP / SSE because
// it pipes bodies both ways without buffering).
function startProxy() {
  const server = http.createServer((req, res) => {
    const port = targetFor(req.url ?? "/");
    // Without a dashboard, non-MCP paths (incl. "/" — PlayMCP's health probe)
    // get a plain 200 instead of proxying to a service that isn't running.
    if (port === DASHBOARD_PORT && !DASHBOARD_ENABLED) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", service: "mcp-foundry", mcp: "/mcp" }));
      return;
    }
    const upstream = http.request(
      { host: "127.0.0.1", port, path: req.url, method: req.method, headers: req.headers },
      (upRes) => {
        res.writeHead(upRes.statusCode ?? 502, upRes.headers);
        upRes.pipe(res);
      }
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
      res.end("upstream unavailable");
    });
    req.pipe(upstream);
  });
  server.listen(PUBLIC_PORT, () => log("proxy", `listening on :${PUBLIC_PORT}\n`));
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

async function main() {
  requireEnv();
  mkdirSync(SPEC_STORE_DIR, { recursive: true });
  await runMigrations();
  start("creator-mcp", "node", ["apps/creator-mcp/dist/index.js"]);
  start("runtime-host", "node", ["apps/runtime-host/dist/index.js"]);
  start("worker", "node", ["apps/worker/dist/index.js"]);
  if (DASHBOARD_ENABLED) {
    start("dashboard", "node_modules/.bin/next", ["start", "-p", String(DASHBOARD_PORT)], {
      cwd: "apps/dashboard",
    });
  }
  // Give the two public-facing services a moment to bind before accepting
  // traffic; the proxy still 502s gracefully if they're not ready yet.
  await Promise.race([waitForPort(CREATOR_PORT), new Promise((r) => setTimeout(r, 5000))]);
  await Promise.race([waitForPort(RUNTIME_PORT), new Promise((r) => setTimeout(r, 5000))]);
  startProxy();
}

main().catch((err) => {
  log("start", `fatal: ${err?.message ?? err}\n`);
  shutdown(1);
});
