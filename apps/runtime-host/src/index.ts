import { createPool } from "@mcp-foundry/db";
import { buildApp } from "./app.js";
import { TtlCache } from "./cache/ttl-cache.js";
import { loadConfig } from "./config.js";
import { CircuitBreakerRegistry } from "./limits/circuit-breaker.js";
import { ConcurrencyLimiter } from "./limits/concurrency-limiter.js";
import { McpServerPool } from "./mcp/mcp-server-pool.js";
import { DbStatusGatedSpecRegistry } from "./registry/db-status-gated-registry.js";
import { FileSpecRegistry } from "./registry/file-registry.js";
import type { SpecRegistry } from "./registry/types.js";

const config = loadConfig();

const fileRegistry = new FileSpecRegistry(config.specStoreDir);
const registry: SpecRegistry = config.databaseUrl
  ? new DbStatusGatedSpecRegistry(createPool(config.databaseUrl), fileRegistry)
  : fileRegistry;

const pool = new McpServerPool({
  registry,
  toolCache: new TtlCache(),
  circuitBreakers: new CircuitBreakerRegistry({ failureThreshold: 5, cooldownMs: 30_000 }),
  concurrency: new ConcurrencyLimiter(4),
  globalEgressAllowlist: config.egressAllowlist,
});

const app = buildApp({ pool });

// This is the process entrypoint's own startup line, not application
// business logic — no request-scoped logger exists yet in this monorepo,
// and the same console.log-on-listen pattern is already established by
// scripts/spike/server.mjs.
app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`runtime-host listening on :${config.port}`);
});
