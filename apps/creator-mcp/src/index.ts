import { createPool } from "@mcp-foundry/db";
import { loadEnv } from "@mcp-foundry/shared";
import { createApp } from "./app.js";
import { createSignedOwnerTokenAuthN } from "./auth/signed-owner-token.js";
import { createPgRepos } from "./repos/pg-repos.js";

const env = loadEnv();
const pool = createPool(env.DATABASE_URL);
const repos = createPgRepos(pool);
const authn = createSignedOwnerTokenAuthN({ secret: env.OWNER_TOKEN_SECRET, users: repos.users });

// apps/dashboard runs as its own process/domain (DASHBOARD_PORT locally, a
// separate Vercel domain in production) — distinct from this server's own
// PUBLIC_BASE_URL. DASHBOARD_PUBLIC_URL is an optional override for
// deployments where the dashboard isn't reachable at localhost:DASHBOARD_PORT.
const dashboardBaseUrl = process.env.DASHBOARD_PUBLIC_URL ?? `http://localhost:${env.DASHBOARD_PORT}`;

const app = createApp({ authn, repos, dashboardBaseUrl });

app.listen(env.CREATOR_PORT, () => {
  // eslint-disable-next-line no-console -- process boot line, no logger wired up yet in this MVP
  console.log(`Creator MCP server listening on :${env.CREATOR_PORT}`);
});
