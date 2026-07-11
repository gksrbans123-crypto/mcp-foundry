# syntax=docker/dockerfile:1
#
# apps/dashboard — Next.js "My MCP Servers" management UI.
# Build context MUST be the repo root (pnpm workspace):
#   docker build -f apps/dashboard/Dockerfile -t mcp-foundry-dashboard .
#
# Renders server-side against Postgres (falls back to demo data when
# DATABASE_URL is unset). Served by `next start` on DASHBOARD_PORT (default
# 3000). Next.js reads workspace deps (@mcp-foundry/db, @mcp-foundry/shared)
# at request time, so this image keeps the resolved node_modules rather than
# using `pnpm deploy` (which is aimed at plain Node entrypoints).

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /repo

FROM base AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
# Builds @mcp-foundry/dashboard and its workspace deps (db, shared).
RUN pnpm turbo run build --filter=@mcp-foundry/dashboard

FROM base AS runner
ENV NODE_ENV=production
ENV DASHBOARD_PORT=3000
WORKDIR /repo
# Carry the resolved workspace (node_modules + built .next + workspace deps)
# so Next's server runtime resolves @mcp-foundry/* and pg. devDependencies are
# left in place for reliability; switch to Next `output: "standalone"` later to
# slim this image.
COPY --from=builder --chown=node:node /repo ./
USER node
EXPOSE 3000
WORKDIR /repo/apps/dashboard
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.DASHBOARD_PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["pnpm", "start"]
