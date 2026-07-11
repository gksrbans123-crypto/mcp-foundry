# syntax=docker/dockerfile:1
#
# apps/creator-mcp — the public MCP server (Streamable HTTP, stateless).
# Build context MUST be the repo root (pnpm workspace):
#   docker build -f apps/creator-mcp/Dockerfile -t mcp-foundry-creator .
#
# Serves POST /mcp on CREATOR_PORT (default 3001). Enqueues jobs into Postgres
# and returns immediately — no LLM/build in the request path.

FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /repo

FROM base AS builder
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json turbo.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@mcp-foundry/creator-mcp
RUN pnpm --filter=@mcp-foundry/creator-mcp deploy --legacy --prod /prod

FROM base AS runner
ENV NODE_ENV=production
ENV CREATOR_PORT=3001
WORKDIR /app
COPY --from=builder --chown=node:node /prod ./
USER node
EXPOSE 3001
CMD ["node", "dist/index.js"]
