ARG NODE_VERSION=22

# ---- Base: Node + pnpm via corepack ----
FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /app

# ---- Fetch: download packages (cached unless lockfile changes) ----
FROM base AS fetch
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# ---- Build: install workspace deps and build the target app ----
FROM fetch AS build
ARG APP_NAME=reader
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm --filter tutors-${APP_NAME}... build
RUN pnpm --filter tutors-${APP_NAME} deploy --prod /deploy
RUN cp -r apps/${APP_NAME}/build /deploy/build

# ---- Runtime: minimal production image ----
FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /deploy ./

# OpenShift compatibility: allow arbitrary UIDs (assigned at runtime)
RUN chgrp -R 0 /app && chmod -R g=u /app

EXPOSE 3000
USER 1001

CMD ["node", "build/index.js"]
