export interface RuntimeHostConfig {
  port: number;
  /** Process-wide egress allowlist (comma-separated hostnames). Empty = no
   * extra restriction beyond each spec's own declared hosts. */
  egressAllowlist: string[];
  /** Directory for the file-backed SpecRegistry fallback / DB-registry's
   * inner spec store. */
  specStoreDir: string;
  /** If set, DbStatusGatedSpecRegistry is used as the tenant/status gate. */
  databaseUrl?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RuntimeHostConfig {
  const portRaw = env.RUNTIME_PORT ?? "3002";
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`RUNTIME_PORT must be a positive integer, got "${portRaw}"`);
  }

  const egressAllowlist = (env.EGRESS_ALLOWLIST ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);

  const specStoreDir = env.SPEC_STORE_DIR ?? "./data/specs";
  const databaseUrl = env.DATABASE_URL && env.DATABASE_URL.length > 0 ? env.DATABASE_URL : undefined;

  return { port, egressAllowlist, specStoreDir, databaseUrl };
}
