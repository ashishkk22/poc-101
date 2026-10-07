# syntax=docker/dockerfile:1

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
# dependencies — full install, cached on the lockfile
# ---------------------------------------------------------------------------
FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build — generate the Prisma client and compile TypeScript
# ---------------------------------------------------------------------------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --from=dependencies /app/node_modules ./node_modules
COPY prisma.config.ts tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src
RUN pnpm exec prisma generate && pnpm exec tsc -p tsconfig.build.json

# ---------------------------------------------------------------------------
# production — runtime deps only, non-root
# ---------------------------------------------------------------------------
FROM base AS production
ENV NODE_ENV=production

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh && mkdir -p /app && chown node:node /app

# node:alpine ships an unprivileged `node` user; the image never runs as root.
# Switching user BEFORE the install matters for size as well as security: a
# trailing `chown -R` would copy every installed file into a fresh layer and
# roughly triple the image.
USER node
WORKDIR /app

COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store,uid=1000,gid=1000 \
    pnpm install --frozen-lockfile --prod

# Prisma CLI and config are kept so the container can run `migrate deploy`.
COPY --chown=node:node prisma.config.ts ./
COPY --chown=node:node prisma ./prisma
# `dist` already contains the compiled Prisma client at dist/src/generated,
# which is what the runtime imports resolve to. No source tree is shipped.
COPY --from=build --chown=node:node /app/dist ./dist

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["entrypoint.sh"]
CMD ["node", "dist/src/app/server.js"]
