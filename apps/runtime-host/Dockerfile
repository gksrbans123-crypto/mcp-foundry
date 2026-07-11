# syntax=docker/dockerfile:1
#
# apps/runtime-host — multi-tenant interpreter runtime (single hardened TCB).
# Build context MUST be the repo root (pnpm workspace):
#   docker build -f apps/runtime-host/Dockerfile -t mcp-foundry-runtime .
#
# Serves generated MCP servers at /s/:slug/mcp on RUNTIME_PORT (default 3002)
# plus /healthz. Reads deployed specs from SPEC_STORE_DIR, which MUST be the
# same volume apps/worker writes to.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /repo

FROM base AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@mcp-foundry/runtime-host
RUN pnpm --filter=@mcp-foundry/runtime-host deploy --legacy --prod /prod

FROM base AS runner
ENV NODE_ENV=production
ENV RUNTIME_PORT=3002
ENV SPEC_STORE_DIR=/data/specs
WORKDIR /app
COPY --from=builder --chown=node:node /prod ./
RUN mkdir -p /data/specs && chown -R node:node /data
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.RUNTIME_PORT||3002)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
