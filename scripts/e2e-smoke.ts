// Task #12 E2E smoke: boots creator-mcp + worker + runtime-host against a
// real (or gracefully-skipped) Postgres, drives the full
// create -> queued -> active -> live-MCP-round-trip -> Inspector flow
// through the real HTTP surfaces (no direct DB/internal-API shortcuts), and
// prints a console checklist. See docs/acceptance-report.md for the plan
// §11 acceptance-criteria write-up this run's numbers feed into.
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInspectorCheck } from "@mcp-foundry/validator";
import { connectMcp, extractField, extractIssuedToken } from "./e2e/mcp-client.js";
import {
  Checklist,
  describeFailure,
  formatMs,
  isPortInUse,
  killManagedAndWait,
  mean,
  parsePostgresHostPort,
  runToCompletion,
  sleep,
  spawnManaged,
  tryDockerComposeUp,
  waitForHttp,
  waitForTcpPort,
  type ManagedProcess,
} from "./e2e/support.js";

const ROOT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATOR_PORT = 3001;
const RUNTIME_PORT = 3002;
const DASHBOARD_PORT = 3000;
// Each sample enqueues a real job that outlives this script (the worker
// keeps draining the queue after we exit) — kept small so repeated runs
// don't pile up an ever-growing backlog of same-template jobs ahead of the
// next run's primary job (see docs/acceptance-report.md's operational note).
const TIMING_SAMPLES = 5;
const JOB_POLL_INTERVAL_MS = 2000;
const JOB_POLL_TIMEOUT_MS = 90_000;

const checklist = new Checklist();
const managed: ManagedProcess[] = [];
let specStoreDir: string | undefined;

function pick(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

async function buildEnv(): Promise<NodeJS.ProcessEnv> {
  specStoreDir = await mkdtemp(path.join(tmpdir(), "mcp-foundry-e2e-specs-"));
  return {
    ...process.env,
    DATABASE_URL: pick("DATABASE_URL", "postgres://mcp_foundry:mcp_foundry@localhost:5432/mcp_foundry"),
    ANTHROPIC_API_KEY: pick("ANTHROPIC_API_KEY", "dummy-key-unused-because-the-weather-template-matches-locally"),
    OWNER_TOKEN_SECRET: pick("OWNER_TOKEN_SECRET", `e2e-smoke-secret-${randomUUID()}`),
    // apps/worker's Deployer uses this to build each generated server's
    // public URL (https://{host}/s/{slug}/mcp) — it must point at
    // runtime-host, not creator-mcp (see .env.example's PUBLIC_BASE_URL comment).
    PUBLIC_BASE_URL: `http://localhost:${RUNTIME_PORT}`,
    CREATOR_PORT: String(CREATOR_PORT),
    RUNTIME_PORT: String(RUNTIME_PORT),
    DASHBOARD_PORT: String(DASHBOARD_PORT),
    DASHBOARD_PUBLIC_URL: `http://localhost:${DASHBOARD_PORT}`,
    GENERATOR_MODEL: pick("GENERATOR_MODEL", "claude-fable-5"),
    // api.open-meteo.com is the weather template's only upstream (packages/spec fixtures/weather.json) —
    // needed by both apps/worker (validating's ephemeral compliance check + probing) and
    // apps/runtime-host (the deployed server's real tool calls).
    EGRESS_ALLOWLIST: "api.open-meteo.com",
    SPEC_STORE_DIR: specStoreDir,
    WORKER_POLL_INTERVAL_MS: "300",
  };
}

async function cleanup(): Promise<void> {
  await Promise.all(managed.map((proc) => killManagedAndWait(proc)));
  if (specStoreDir) await rm(specStoreDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * A leftover process from an earlier run holding one of these ports would
 * otherwise silently race the freshly-spawned ones for job claims (exactly
 * how a stale pre-fix apps/worker corrupted an earlier run of this script
 * with unrelated "command not found" errors) — fail fast and loudly instead.
 */
async function ensurePortsFree(): Promise<void> {
  const busy: number[] = [];
  for (const port of [CREATOR_PORT, RUNTIME_PORT]) {
    if (await isPortInUse(port)) busy.push(port);
  }
  if (busy.length > 0) {
    throw new Error(
      `port(s) ${busy.join(", ")} already in use — stop whatever is listening there (a leftover process from a previous run?) before re-running e2e-smoke`,
    );
  }
}

async function ensurePostgres(env: NodeJS.ProcessEnv): Promise<boolean> {
  await tryDockerComposeUp(ROOT_DIR);
  const { host, port } = parsePostgresHostPort(env.DATABASE_URL!);
  const up = await waitForTcpPort(host, port, 15_000);
  if (up) checklist.pass("Postgres reachable", `${host}:${port}`);
  else checklist.skip("Postgres reachable", "docker/postgres unavailable in this environment — full pipeline steps skipped, see docs/acceptance-report.md");
  return up;
}

async function runMigrations(env: NodeJS.ProcessEnv): Promise<void> {
  try {
    await runToCompletion("pnpm", ["--filter", "@mcp-foundry/db", "db:migrate"], { cwd: ROOT_DIR, env });
    checklist.pass("Database migrations applied (idempotent)");
  } catch (error) {
    checklist.fail("Database migrations applied", String(error));
    throw error;
  }
}

async function buildApps(): Promise<void> {
  try {
    await runToCompletion("pnpm", ["build"], { cwd: ROOT_DIR, env: process.env });
    checklist.pass("pnpm build (creator-mcp, worker, runtime-host + deps)");
  } catch (error) {
    checklist.fail("pnpm build", String(error));
    throw error;
  }
}

async function bootProcesses(env: NodeJS.ProcessEnv): Promise<void> {
  const creator = spawnManaged("creator-mcp", "node", ["dist/index.js"], {
    cwd: path.join(ROOT_DIR, "apps/creator-mcp"),
    env,
  });
  const worker = spawnManaged("worker", "node", ["dist/index.js"], {
    cwd: path.join(ROOT_DIR, "apps/worker"),
    env,
  });
  const runtimeHost = spawnManaged("runtime-host", "node", ["dist/index.js"], {
    cwd: path.join(ROOT_DIR, "apps/runtime-host"),
    env,
  });
  managed.push(creator, worker, runtimeHost);

  const creatorReady = await waitForMcpReady(`http://localhost:${CREATOR_PORT}/mcp`, 20_000);
  if (creatorReady) checklist.pass("apps/creator-mcp booted", `:${CREATOR_PORT}`);
  else checklist.fail("apps/creator-mcp booted", describeFailure(creator));

  const runtimeReady = await waitForHttp(`http://localhost:${RUNTIME_PORT}/healthz`, 20_000);
  if (runtimeReady) checklist.pass("apps/runtime-host booted", `:${RUNTIME_PORT}/healthz`);
  else checklist.fail("apps/runtime-host booted", describeFailure(runtimeHost));

  // apps/worker has no HTTP surface — readiness is "the process is still alive
  // and printed its boot line" rather than a port check.
  await sleep(800);
  const workerAlive = worker.child.exitCode === null && !worker.child.killed;
  const workerLoggedBoot = worker.outputTail.some((line) => line.includes("polling every"));
  if (workerAlive && workerLoggedBoot) checklist.pass("apps/worker booted", "polling loop started");
  else checklist.fail("apps/worker booted", describeFailure(worker));

  if (!creatorReady || !runtimeReady || !workerAlive) {
    throw new Error("one or more processes failed to boot — see checklist detail above");
  }
}

async function waitForMcpReady(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const session = await connectMcp(url);
      await session.close();
      return true;
    } catch {
      await sleep(300);
    }
  }
  return false;
}

interface TimingResult {
  durationsMs: number[];
  primaryToken: string;
  primaryJobId: string;
}

async function measureCreateLatencyAndEnqueuePrimaryJob(uniqueName: string): Promise<TimingResult> {
  const durationsMs: number[] = [];
  let primaryToken: string | undefined;
  let primaryJobId: string | undefined;

  for (let i = 0; i < TIMING_SAMPLES; i++) {
    // Each sample opens a *fresh* (tokenless) connection so creator-mcp
    // auto-provisions a new user per call — this measures create_mcp_server's
    // own enqueue-and-return latency (plan §11 criterion 3) without ever
    // tripping the 3/min mutate rate limit, which is scoped per user.
    const session = await connectMcp(`http://localhost:${CREATOR_PORT}/mcp`);
    const start = Date.now();
    const result = await session.callTool("create_mcp_server", {
      spec_text: "날씨 알려주는 MCP 서버 만들어줘",
      ...(i === 0 ? { name: uniqueName } : {}),
    });
    durationsMs.push(Date.now() - start);

    if (i === 0) {
      if (result.isError) throw new Error(`primary create_mcp_server call failed: ${result.text}`);
      primaryToken = extractIssuedToken(result.text);
      primaryJobId = extractField(result.text, "Job ID");
    }
    await session.close();
  }

  if (!primaryToken || !primaryJobId) {
    throw new Error("could not extract owner token / job id from the primary create_mcp_server response");
  }
  return { durationsMs, primaryToken, primaryJobId };
}

interface JobOutcome {
  stage: string;
  error?: string;
  elapsedMs: number;
}

async function pollJobUntilSettled(token: string, jobId: string): Promise<JobOutcome> {
  const session = await connectMcp(`http://localhost:${CREATOR_PORT}/mcp`, token);
  const start = Date.now();
  try {
    while (Date.now() - start < JOB_POLL_TIMEOUT_MS) {
      const result = await session.callTool("get_job_status", { job_id: jobId });
      if (!result.isError) {
        const stage = extractField(result.text, "Stage") ?? "unknown";
        if (stage === "active" || stage === "failed") {
          const error = extractField(result.text, "Error");
          return { stage, error: error === "_none_" ? undefined : error, elapsedMs: Date.now() - start };
        }
      }
      // A rate-limited poll (isError with no stage) just means "try again
      // shortly" — it is not a job failure, so the loop continues either way.
      await sleep(JOB_POLL_INTERVAL_MS);
    }
    return { stage: "timeout", elapsedMs: Date.now() - start };
  } finally {
    await session.close();
  }
}

async function verifyServerViaOwnerTools(
  token: string,
  jobId: string,
): Promise<{ serverId: string; publicUrl: string; slug: string } | undefined> {
  const session = await connectMcp(`http://localhost:${CREATOR_PORT}/mcp`, token);
  try {
    const statusResult = await session.callTool("get_job_status", { job_id: jobId });
    const serverId = extractField(statusResult.text, "Server ID");
    if (!serverId) {
      checklist.fail("get_job_status exposes server_id", statusResult.text);
      return undefined;
    }
    checklist.pass("get_job_status exposes server_id", serverId);

    const listResult = await session.callTool("list_my_servers", {});
    const listedOwnServer = listResult.text.includes(serverId);
    if (listedOwnServer) checklist.pass("list_my_servers shows the newly created server");
    else checklist.fail("list_my_servers shows the newly created server", listResult.text);

    const detailsResult = await session.callTool("get_server_details", { server_id: serverId });
    const publicUrl = extractField(detailsResult.text, "Public URL");
    if (!publicUrl) {
      checklist.fail("get_server_details returns a public URL", detailsResult.text);
      return undefined;
    }
    checklist.pass("get_server_details returns a public URL", publicUrl);

    const slugMatch = publicUrl.match(/\/s\/([^/]+)\/mcp/);
    if (!slugMatch) {
      checklist.fail("public URL matches the /s/:slug/mcp pattern (plan §1)", publicUrl);
      return undefined;
    }
    checklist.pass("public URL matches the /s/:slug/mcp pattern (plan §1)");

    return { serverId, publicUrl, slug: slugMatch[1]! };
  } finally {
    await session.close();
  }
}

async function verifyGeneratedServerRoundTrip(publicUrl: string): Promise<void> {
  const session = await connectMcp(publicUrl);
  try {
    const tools = await session.listTools();
    const toolNames = tools.map((tool) => tool.name).sort();
    const expected = ["compare_weather", "get_current_weather", "get_forecast"];
    const hasAllExpected = expected.every((name) => toolNames.includes(name));
    if (hasAllExpected) checklist.pass("generated server tools/list", toolNames.join(", "));
    else checklist.fail("generated server tools/list", `got: ${toolNames.join(", ")}`);

    const result = await session.callTool("get_current_weather", { latitude: 37.57, longitude: 126.98 });
    if (!result.isError && result.text.includes("Current Weather")) {
      checklist.pass("generated server tools/call get_current_weather", "real Open-Meteo response");
    } else {
      checklist.fail("generated server tools/call get_current_weather", result.text);
    }
  } finally {
    await session.close();
  }
}

// runInspectorCheck shells out to `npx @modelcontextprotocol/inspector`,
// resolved relative to this process's cwd (repo root) — pnpm's strict
// node_modules isolation only exposes that bin here if the root package.json
// declares it directly (same reason apps/worker needed it — see that
// package's src/compliance/checker.ts comment).
async function verifyInspectorCompliance(publicUrl: string, label: string, toolCalls: { name: string; args: Record<string, string> }[]): Promise<void> {
  const result = await runInspectorCheck(publicUrl, { toolCalls });
  if (result.valid) checklist.pass(`Inspector compliance check: ${label}`);
  else checklist.fail(`Inspector compliance check: ${label}`, result.violations.map((v) => v.message).join("; "));
}

async function main(): Promise<void> {
  console.log("=== MCP Foundry E2E smoke (task #12) ===\n");
  await ensurePortsFree();
  const env = await buildEnv();

  const postgresUp = await ensurePostgres(env);
  if (!postgresUp) {
    printSummary();
    process.exitCode = checklist.hasFailure ? 1 : 0;
    return;
  }

  await runMigrations(env);
  await buildApps();
  await bootProcesses(env);

  const uniqueName = `Weather Smoke ${new Date().toISOString()}`;
  const timing = await measureCreateLatencyAndEnqueuePrimaryJob(uniqueName);
  const avgMs = mean(timing.durationsMs);
  const maxMs = Math.max(...timing.durationsMs);
  checklist.pass(
    `create_mcp_server response latency over ${TIMING_SAMPLES} calls`,
    `avg ${formatMs(avgMs)}, max ${formatMs(maxMs)} (plan §11 targets: avg~100ms, p99/max 3000ms)`,
  );

  const outcome = await pollJobUntilSettled(timing.primaryToken, timing.primaryJobId);
  if (outcome.stage === "active") {
    checklist.pass("job reached 'active'", `in ${formatMs(outcome.elapsedMs)}`);
  } else {
    checklist.fail("job reached 'active'", `stage=${outcome.stage} error=${outcome.error ?? "n/a"} after ${formatMs(outcome.elapsedMs)}`);
    printSummary();
    process.exitCode = 1;
    return;
  }

  const server = await verifyServerViaOwnerTools(timing.primaryToken, timing.primaryJobId);
  await verifyInspectorCompliance(`http://localhost:${CREATOR_PORT}/mcp`, "Creator MCP itself", [
    { name: "get_dashboard_link", args: {} },
  ]);

  if (server) {
    await verifyGeneratedServerRoundTrip(server.publicUrl);
    await verifyInspectorCompliance(server.publicUrl, `generated server (${server.slug})`, [
      { name: "get_current_weather", args: { latitude: "37.57", longitude: "126.98" } },
      { name: "get_forecast", args: { latitude: "37.57", longitude: "126.98" } },
      { name: "compare_weather", args: { latitudes: "37.57,35.18", longitudes: "126.98,129.08" } },
    ]);
  }

  printSummary();
  process.exitCode = checklist.hasFailure ? 1 : 0;
}

function printSummary(): void {
  console.log("\n=== Summary ===");
  const passCount = checklist.entries.filter((e) => e.status === "pass").length;
  const failCount = checklist.entries.filter((e) => e.status === "fail").length;
  const skipCount = checklist.entries.filter((e) => e.status === "skip").length;
  console.log(`${passCount} passed, ${failCount} failed, ${skipCount} skipped`);
}

main()
  .catch((error) => {
    console.error("\ne2e-smoke aborted:", error);
    process.exitCode = 1;
  })
  .finally(cleanup);
