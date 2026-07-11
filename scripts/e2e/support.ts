// Shared low-level helpers for scripts/e2e-smoke.ts: process spawning with
// captured output, Postgres reachability, and small polling/formatting
// utilities. Kept separate from the main script so the orchestration flow
// in e2e-smoke.ts reads top-to-bottom without this plumbing in the way.
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import net from "node:net";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ManagedProcess {
  name: string;
  child: ChildProcessWithoutNullStreams;
  /** Rolling tail of combined stdout+stderr, for diagnostics on failure. */
  outputTail: string[];
}

const OUTPUT_TAIL_LINES = 40;

/** Spawns a child process, capturing a rolling tail of its output for diagnostics. Never throws on its own — spawn errors surface via the 'error' listener into outputTail. */
export function spawnManaged(
  name: string,
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): ManagedProcess {
  const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: "pipe" });
  const outputTail: string[] = [];

  const capture = (chunk: Buffer) => {
    for (const line of chunk.toString("utf8").split("\n")) {
      if (line.length === 0) continue;
      outputTail.push(line);
      if (outputTail.length > OUTPUT_TAIL_LINES) outputTail.shift();
    }
  };
  child.stdout.on("data", capture);
  child.stderr.on("data", capture);
  child.on("error", (error) => capture(Buffer.from(`[spawn error] ${String(error)}`)));

  return { name, child, outputTail };
}

/**
 * apps/worker's own shutdown is cooperative ("finish the in-flight job then
 * exit") — a bare SIGTERM can leave it running well past this process's own
 * exit if it's mid-way through a slow stage (e.g. a hanging subprocess
 * call). Waits for a real exit, escalating to SIGKILL, so a leftover worker
 * from a previous run can never keep claiming jobs during a later run.
 */
export async function killManagedAndWait(proc: ManagedProcess, timeoutMs = 5000): Promise<void> {
  if (proc.child.exitCode !== null || proc.child.killed) return;
  const exited = new Promise<void>((resolve) => proc.child.once("exit", () => resolve()));
  proc.child.kill("SIGTERM");
  const timedOut = await Promise.race([exited.then(() => false), sleep(timeoutMs).then(() => true)]);
  if (timedOut && proc.child.exitCode === null) {
    proc.child.kill("SIGKILL");
    await exited;
  }
}

export function describeFailure(proc: ManagedProcess): string {
  return `--- ${proc.name} output tail ---\n${proc.outputTail.join("\n")}`;
}

/** Runs a one-shot command to completion (e.g. `pnpm build`, `db:migrate`) and rejects on non-zero exit. */
export function runToCompletion(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

/** Best-effort `docker compose up -d postgres` — failures are swallowed by the caller, which falls back to checking whatever Postgres is already reachable. */
export function tryDockerComposeUp(cwd: string): Promise<void> {
  return runToCompletion("docker", ["compose", "up", "-d", "postgres"], { cwd, env: process.env }).catch(() => {});
}

/** True if `port` is already occupied on localhost — used as a pre-flight guard so a leftover process from a prior run fails loudly instead of silently racing the new one for job claims. */
export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(500, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/** Polls a TCP host:port until it accepts a connection, or the timeout elapses. */
export async function waitForTcpPort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const reachable = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host, port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.setTimeout(1000, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (reachable) return true;
    await sleep(300);
  }
  return false;
}

/** Polls a URL with GET until it responds (any status), or the timeout elapses. */
export async function waitForHttp(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return true;
    } catch {
      await sleep(300);
    }
  }
  return false;
}

export function parsePostgresHostPort(databaseUrl: string): { host: string; port: number } {
  const url = new URL(databaseUrl);
  return { host: url.hostname, port: Number(url.port || "5432") };
}

export type ChecklistStatus = "pass" | "fail" | "skip";

export interface ChecklistItem {
  label: string;
  status: ChecklistStatus;
  detail?: string;
}

/** "skip" is for environment-constrained steps (e.g. no local Docker/Postgres) — reported distinctly from a real failure, per task #12's "환경 제약 항목은 사유와 함께 명시" completion criterion. */
export class Checklist {
  private readonly items: ChecklistItem[] = [];

  record(label: string, status: ChecklistStatus, detail?: string): void {
    this.items.push({ label, status, detail });
    const mark = status.toUpperCase();
    const suffix = detail ? ` — ${detail}` : "";
    // eslint-disable-next-line no-console -- this script's whole purpose is console checklist output
    console.log(`[${mark}] ${label}${suffix}`);
  }

  pass(label: string, detail?: string): void {
    this.record(label, "pass", detail);
  }

  fail(label: string, detail?: string): void {
    this.record(label, "fail", detail);
  }

  skip(label: string, detail?: string): void {
    this.record(label, "skip", detail);
  }

  get hasFailure(): boolean {
    return this.items.some((item) => item.status === "fail");
  }

  get entries(): readonly ChecklistItem[] {
    return this.items;
  }
}

export function formatMs(ms: number): string {
  return `${ms.toFixed(0)}ms`;
}

export function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
