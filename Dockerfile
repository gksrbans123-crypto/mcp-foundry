# syntax=docker/dockerfile:1
#
# ── MCP Foundry — all-in-one image (single Dockerfile, single public port) ──
#
# Runs creator-mcp + worker + runtime-host + dashboard in ONE container behind
# a small path-routing reverse proxy (deploy/all-in-one/start.mjs). This is the
# submission/demo-friendly build: one image, one URL. Postgres is external.
#
# The public MCP endpoint you register on PlayMCP is:   https://<your-host>/mcp
# Generated servers are served at:                      https://<your-host>/s/{slug}/mcp
# The management dashboard is at:                       https://<your-host>/
#
# Required env at run time:
#   DATABASE_URL         managed Postgres connection string
#   OWNER_TOKEN_SECRET   >=32 chars (openssl rand -base64 32)
#   PUBLIC_BASE_URL      external base URL, e.g. https://your-host  (no trailing /mcp)
#   DASHBOARD_PUBLIC_URL external base URL, e.g. https://your-host
#   ANTHROPIC_API_KEY    for NL -> spec generation (optional for template-only demos)
# Optional: PORT (default 8080), EGRESS_ALLOWLIST, GENERATOR_MODEL.
#
# Build (context = repo root):   docker build -t mcp-foundry .
# Run:                           docker run -p 8080:8080 \
#                                  -v mcpf_specs:/data/specs \  # persist generated servers across restarts
#                                  --env-file .env mcp-foundry
# NOTE: mount a volume at /data/specs — without it, every generated server's
# spec file is lost on restart (the DB still lists it 'active' but runtime 404s).

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /repo

# ---- builder: install everything and build all four apps ----
FROM base AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

# ---- runner: full workspace (all dist + node_modules incl. tsx for migrations
#      and next for the dashboard) plus the supervisor/proxy entrypoint ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080
ENV SPEC_STORE_DIR=/data/specs
WORKDIR /repo
COPY --from=builder --chown=node:node /repo ./
COPY --chown=node:node deploy/all-in-one/start.mjs ./deploy/all-in-one/start.mjs
RUN mkdir -p /data/specs && chown -R node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "deploy/all-in-one/start.mjs"]
