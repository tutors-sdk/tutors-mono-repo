# syntax=docker/dockerfile:1

# The Tutors Live ingest consumer: bus -> Valkey + TimescaleDB.
#
#   docker build -f services/live-ingest/Dockerfile -t tutors/live-ingest .
#   docker run --rm -e LIVE_BUS=redis -e LIVE_REDIS_URL=... tutors/live-ingest
#
# The service is bundled to a single file at build time, so the runtime image
# carries only the two drivers that cannot be bundled (pg, redis) and no
# TypeScript toolchain. Configuration is read from the environment at startup.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_HOME=/pnpm/corepack \
    npm_config_store_dir=/pnpm/store \
    CI=true
ENV PATH=${PNPM_HOME}:${PATH}
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

FROM deps AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile
RUN pnpm --filter @tutors/live-ingest build
# --legacy: this workspace uses symlinked (not injected) workspace packages.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @tutors/live-ingest deploy --prod --legacy --ignore-scripts /out
RUN cp -r services/live-ingest/dist /out/dist

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="tutors-live-ingest" \
      org.opencontainers.image.source="https://github.com/tutors-sdk/tutors-mono-repo" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    PORT=3010 \
    NODE_OPTIONS=--enable-source-maps

WORKDIR /app

# Non-root UID with GID 0, so OpenShift's arbitrary-UID model can read everything.
COPY --from=build --chown=1001:0 /out/package.json ./package.json
COPY --from=build --chown=1001:0 /out/node_modules ./node_modules
COPY --from=build --chown=1001:0 /out/dist ./dist

USER 1001
EXPOSE 3010

CMD ["node", "dist/main.js"]
