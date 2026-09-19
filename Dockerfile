# syntax=docker/dockerfile:1

# Builds any of the four SvelteKit apps in this monorepo into a self-contained
# Node.js image. Select the app with --build-arg APP_NAME=<reader|catalogue|live|time>.
#
#   docker build --build-arg APP_NAME=reader -t tutors/reader .
#   docker run --rm -p 3000:3000 -e ORIGIN=http://localhost:3000 tutors/reader
#
# Published images live at quay.io/tutors-sdk/tutors-<app> (Quay repositories
# are exactly <org>/<repo>, so the app is part of the repository name):
#
#   docker build --build-arg APP_NAME=reader --build-arg VERSION=16.2.2 \
#     --build-arg GIT_SHA=$(git rev-parse HEAD) --build-arg BUILD_DATE=$(date -u +%FT%TZ) \
#     -t quay.io/tutors-sdk/tutors-reader:16.2.2 .
#
# All configuration (Supabase, auth, log level, ...) is read from the
# environment at runtime via SvelteKit's $env/dynamic modules, so one image
# serves every environment and no secret is ever baked into a layer.

ARG NODE_VERSION=22
# Base images are fully qualified so the file builds the same under Docker,
# Podman/Buildah and Quay's builders, which do not assume docker.io for short
# names.
ARG NODE_IMAGE=docker.io/library/node:${NODE_VERSION}-bookworm-slim

# ---------------------------------------------------------------------------
# base: Node plus the exact pnpm version pinned in package.json (via corepack)
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_HOME=/pnpm/corepack \
    npm_config_store_dir=/pnpm/store \
    CI=true
ENV PATH=${PNPM_HOME}:${PATH}
WORKDIR /app
COPY package.json ./
RUN corepack enable && corepack install

# ---------------------------------------------------------------------------
# deps: download every package in the lockfile into the pnpm store.
# This layer is only invalidated when the lockfile changes, and the BuildKit
# cache mount keeps already-downloaded tarballs across builds even then.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm fetch

# ---------------------------------------------------------------------------
# build: link the workspace offline, build the app and its workspace
# dependencies, then produce a pruned production tree with `pnpm deploy`.
# ---------------------------------------------------------------------------
FROM deps AS build
ARG APP_NAME=reader
ENV SVELTEKIT_ADAPTER=node
# Names the SvelteKit build (kit.version.name) so two builds of one commit are
# byte-identical; without it SvelteKit falls back to the build timestamp.
ARG GIT_SHA=unknown
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile
RUN pnpm --filter "tutors-${APP_NAME}..." build
# --legacy: this workspace uses symlinked (not injected) workspace packages.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter "tutors-${APP_NAME}" deploy --prod --legacy --ignore-scripts /out
# adapter-node serves static files with an ETag of size + mtime and a
# Last-Modified header. Given SOURCE_DATE_EPOCH (the commit time), every mtime is
# pinned to it, so two builds of one commit answer identical headers. Without
# it, mtimes stay at build time: never pin to a constant, or a changed file of
# the same size would keep its ETag across releases.
ARG SOURCE_DATE_EPOCH
RUN if [ -n "${SOURCE_DATE_EPOCH}" ]; then find /out/build -exec touch -h -d "@${SOURCE_DATE_EPOCH}" {} +; fi

# ---------------------------------------------------------------------------
# runtime: minimal image with only the server bundle and production deps.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
ARG APP_NAME=reader
ARG GIT_SHA=unknown
ARG BUILD_DATE=unknown
ARG VERSION=unknown

# Quay shows description, source and version on the repository's tag page;
# the release harness reads revision and version to trace a report to a commit.
LABEL org.opencontainers.image.title="tutors-${APP_NAME}" \
      org.opencontainers.image.description="Tutors ${APP_NAME}: SvelteKit app served by Node.js" \
      org.opencontainers.image.vendor="Tutors SDK" \
      org.opencontainers.image.url="https://tutors.dev" \
      org.opencontainers.image.source="https://github.com/tutors-sdk/tutors-mono-repo" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.licenses="MIT"

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    NODE_OPTIONS=--enable-source-maps

WORKDIR /app

# Owned by a non-root UID with GID 0 so OpenShift's arbitrary-UID model
# (random UID, always GID 0) can read everything. Nothing here is writable
# at runtime; the app never writes to its own filesystem.
COPY --from=build --chown=1001:0 /out/package.json ./package.json
COPY --from=build --chown=1001:0 /out/node_modules ./node_modules
COPY --from=build --chown=1001:0 /out/build ./build

# Build identity, answered by GET /version and nowhere else.
ENV GIT_SHA=${GIT_SHA} \
    BUILD_DATE=${BUILD_DATE}

USER 1001
EXPOSE 3000

CMD ["node", "build/index.js"]
