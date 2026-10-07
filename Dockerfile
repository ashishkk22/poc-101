# syntax=docker/dockerfile:1

# One image for the whole app: the API serves the built SPA, so the frontend
# and the API share a single origin. Build from the repository root:
#   docker build --target production -t sync .

# ---------------------------------------------------------------------------
# base — pinned runtime, pnpm via corepack
# ---------------------------------------------------------------------------
FROM node:24-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Corepack resolves pnpm from `packageManager` in package.json, so every stage
# uses the exact version that produced pnpm-lock.yaml. Without the pin, the
# image would fetch pnpm latest, whose lockfile policies reject an older
# lockfile and make the build non-reproducible.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# web — build the SPA. VITE_API_BASE_URL is deliberately unset: the bundle
# then talks to whatever origin served it, which is this API.
# ---------------------------------------------------------------------------
FROM base AS web
WORKDIR /web
COPY sync-web/package.json sync-web/pnpm-lock.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile
COPY sync-web/ ./
RUN pnpm build

# ---------------------------------------------------------------------------
# dependencies — full install, cached on the lockfile
# ---------------------------------------------------------------------------
FROM base AS dependencies
COPY sync-backend/package.json sync-backend/pnpm-lock.yaml sync-backend/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build — generate the Prisma client and compile TypeScript
# ---------------------------------------------------------------------------
FROM base AS build
COPY sync-backend/package.json sync-backend/pnpm-lock.yaml sync-backend/pnpm-workspace.yaml ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY sync-backend/prisma.config.ts sync-backend/tsconfig.json sync-backend/tsconfig.build.json ./
COPY sync-backend/prisma ./prisma
COPY sync-backend/src ./src
RUN pnpm exec prisma generate && pnpm exec tsc -p tsconfig.build.json

# ---------------------------------------------------------------------------
# production — runtime deps only, non-root
# ---------------------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production
ENV WEB_DIST_DIR=/app/public

COPY sync-backend/docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /app && chown node:node /app

# node:alpine ships an unprivileged `node` user; the image never runs as root.
# Switching user BEFORE the install matters for size as well as security: a
# trailing `chown -R` would copy every installed file into a fresh layer and
# roughly triple the image.
USER node
WORKDIR /app

COPY --chown=node:node sync-backend/package.json sync-backend/pnpm-lock.yaml sync-backend/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store,uid=1000,gid=1000 \
    pnpm install --frozen-lockfile --prod

# Prisma CLI and config are kept so the container can run `migrate deploy`.
COPY --chown=node:node sync-backend/prisma.config.ts ./
COPY --chown=node:node sync-backend/prisma ./prisma
# `dist` already contains the compiled Prisma client at dist/src/generated,
# which is what the runtime imports resolve to. No source tree is shipped.
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=web --chown=node:node /web/dist ./public

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "dist/src/app/server.js"]
