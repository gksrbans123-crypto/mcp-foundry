import { createPool, PgQueue } from "@mcp-foundry/db";
import { AnthropicLLMClient, generateSpec } from "@mcp-foundry/generator";
import { validateSpec } from "@mcp-foundry/validator";
import { buildFetchGuardForSpec } from "./build-fetch-guard.js";
import { checkCompliance } from "./compliance/checker.js";
import { loadWorkerConfig } from "./config.js";
import { LocalFileDeployer } from "./deploy/local-file-deployer.js";
import { createGuardedOpenApiFetcher } from "./egress/guarded-openapi-fetch.js";
import { startWorkerLoop } from "./loop.js";
import { probeSpec } from "./probe/run-probe.js";
import { createPgWorkerRepos } from "./repos/pg-repos.js";
import type { PipelineDeps } from "./stage-machine/types.js";

const config = loadWorkerConfig();
const pool = createPool(config.env.DATABASE_URL);
const llm = new AnthropicLLMClient(config.env.ANTHROPIC_API_KEY, config.env.GENERATOR_MODEL);
// Security review HIGH-1: without this, generateSpec would fall back to
// packages/generator's raw-fetch default for a user-supplied openapi_url —
// the one egress path in this system with no SSRF/DNS-rebinding guard.
const fetchOpenApi = createGuardedOpenApiFetcher({ globalAllowlist: config.egressAllowlist });

const deps: PipelineDeps = {
  queue: new PgQueue(pool),
  repos: createPgWorkerRepos(pool),
  generate: (request) => generateSpec(request, { llm, fetchOpenApi }),
  validateSpec,
  checkCompliance: (spec) => checkCompliance(spec, buildFetchGuardForSpec(spec, config.egressAllowlist)),
  probe: (spec) => probeSpec(spec, { fetchGuard: buildFetchGuardForSpec(spec, config.egressAllowlist) }),
  deployer: new LocalFileDeployer(config.specStoreDir, config.env.PUBLIC_BASE_URL),
};

const shutdownController = new AbortController();

function shutdown(signal: string): void {
  // eslint-disable-next-line no-console -- process lifecycle line, no logger wired up yet in this MVP
  console.log(`${signal} received, finishing the in-flight job then exiting...`);
  shutdownController.abort();
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// eslint-disable-next-line no-console -- process boot line, matches apps/creator-mcp and apps/runtime-host's pattern
console.log(`apps/worker (${config.workerId}) polling every ${config.pollIntervalMs}ms`);

startWorkerLoop(
  config.workerId,
  deps,
  { pollIntervalMs: config.pollIntervalMs, staleLockMs: config.staleLockMs, maxAttempts: config.maxAttempts },
  shutdownController.signal,
)
  .then(() => pool.end())
  .catch(async (error) => {
    // eslint-disable-next-line no-console -- fatal startup/loop error, no logger wired up yet
    console.error("apps/worker loop crashed:", error);
    await pool.end();
    process.exitCode = 1;
  });
