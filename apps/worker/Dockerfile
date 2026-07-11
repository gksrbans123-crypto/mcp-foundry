# syntax=docker/dockerfile:1
#
# apps/worker — background pipeline (generate → build → validate → probe → deploy).
# Build context MUST be the repo root (pnpm workspace):
#   docker build -f apps/worker/Dockerfile -t mcp-foundry-worker .
#
# Runtime notes:
#  - Calls `npx @modelcontextprotocol/inspector@0.22.0` during the validating
#    stage; inspector is a prod dependency so it ships in the image and npx
#    resolves it locally (no network fetch).
#  - Writes deployed specs to SPEC_STORE_DIR, which MUST be a volume shared
#    with apps/runtime-host (it reads the same directory).
#  - Needs outbound network for the Anthropic API (generator) and for probing
#    generated servers' upstream APIs (constrained by EGRESS_ALLOWLIST).

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /repo

# ---- builder: install all deps + build this app and its workspace deps ----
FROM base AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@mcp-foundry/worker
# Produce a self-contained, prod-only deploy tree (workspace deps resolved,
# devDeps dropped, inspector kept).
RUN pnpm --filter=@mcp-foundry/worker deploy --legacy --prod /prod

# ---- runner: minimal prod image ----
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /prod ./
# Default shared spec dir; override via env + volume in compose/production.
ENV SPEC_STORE_DIR=/data/specs
RUN mkdir -p /data/specs && chown -R node:node /data
USER node
CMD ["node", "dist/index.js"]
