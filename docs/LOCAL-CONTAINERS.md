# Running Tutors in Containers Locally

This guide walks through building the four Tutors apps (reader, catalogue, live, time) as container images and running them on your own machine with Docker Compose. It takes about ten minutes the first time; later builds reuse cached layers and take a minute or two.

For the image contract, environment variables and the Kubernetes/OpenShift manifests, see [`deploy/README.md`](../deploy/README.md).

## Prerequisites

- Docker Desktop 4.x or Docker Engine 23+ with Compose v2 (`docker compose version` should print `v2` or later). BuildKit is on by default in these versions and is required for the cache mounts the Dockerfile uses.
- About 4 GB of free disk for the build cache and images.
- No `.env` is needed. Without one the apps start in anonymous mode, which needs no Supabase project or GitHub OAuth app.

You do not need Node or pnpm installed; everything is built inside the image.

## Quick start

From the repository root:

```bash
docker compose up --build
```

This builds all four images and starts them. Wait for each service to report `healthy`, then open:

| App | URL |
|-----|-----|
| Reader | http://localhost:3000 |
| Catalogue | http://localhost:3001 |
| Live | http://localhost:3002 |
| Time | http://localhost:3003 |

Press `Ctrl+C` to stop, or run detached with `docker compose up --build -d` and stop later with `docker compose down`.

To build and run only one app:

```bash
docker compose up --build reader
```

## If a port is already in use

Each host port can be overridden with an environment variable: `READER_PORT`, `CATALOGUE_PORT`, `LIVE_PORT` and `TIME_PORT`. For example, if something on your machine already listens on 3000:

```bash
READER_PORT=3010 docker compose up --build
```

The reader is then at http://localhost:3010. The variables also set `ORIGIN` for the app, so links and form actions keep working on the new port.

## Checking a container is healthy

Every app exposes two endpoints:

- `GET /healthz/live` returns `{"status":"ok"}` with no dependencies. Compose and Kubernetes use it for liveness.
- `GET /healthz` also reports Supabase reachability and recent error counts. Kubernetes uses it for readiness.

```bash
curl http://localhost:3000/healthz/live
curl http://localhost:3000/healthz
docker compose ps          # shows (healthy) per service
docker compose logs -f reader
```

Every line is one JSON object: one per request, with the request id, route, status and duration, plus startup, errors and anything a dependency prints. The field contract is in [deploy/README.md](../deploy/README.md#logs).

## Metrics, Prometheus and Grafana

Each app also serves `GET /metrics` in Prometheus format. To see it in Grafana, start the observability stack in a second terminal; it scrapes the four apps through the ports above and needs no configuration:

```bash
cd observability
docker compose up -d
```

Prometheus is at http://localhost:9090 and Grafana at http://localhost:3004 (admin / admin). The Prometheus data source and the alert rules are provisioned automatically. If you changed the app ports, edit `observability/prometheus/prometheus.yml` to match.

## Running with a real Supabase project and GitHub login

Copy `.env.example` to `.env` in the repository root and fill in the values. Compose reads it automatically for every service. At minimum:

```
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=...
PUBLIC_ANON_MODE=
PRIVATE_AUTH_GITHUB_ID=...
PRIVATE_AUTH_GITHUB_SECRET=...
PRIVATE_AUTH_SECRET=...   # at least 32 chars: openssl rand -base64 32
```

Leave `PUBLIC_ANON_MODE` empty (or unset) to enable authentication; set it to `TRUE` to disable it again. Restart the stack after editing `.env`. No rebuild is needed: configuration is read when the container starts, not when the image is built.

The GitHub OAuth app's callback URL must match the port you are using, for example `http://localhost:3000/auth/callback/github`.

## Building an image by hand

The single `Dockerfile` builds any app; pick it with a build argument:

```bash
docker build --build-arg APP_NAME=reader -t tutors/reader .
docker run --rm -p 3000:3000 -e ORIGIN=http://localhost:3000 -e PUBLIC_ANON_MODE=TRUE tutors/reader
```

Useful extra arguments: `NODE_VERSION` (default `22`), and `GIT_SHA` / `BUILD_DATE` for the OCI labels.

## How the build works

1. **base**: `node:22-bookworm-slim` with the pnpm version pinned in `package.json`, installed via corepack.
2. **deps**: `pnpm fetch` downloads every package in the lockfile into a BuildKit cache mount. This layer only changes when the lockfile changes.
3. **build**: the workspace is linked offline, the app and its workspace dependencies are built with `SVELTEKIT_ADAPTER=node`, and `pnpm deploy --prod` produces a pruned tree containing only the packages the server needs at runtime.
4. **runtime**: a fresh slim image receives just `build/`, `package.json` and that pruned `node_modules`. It runs as UID 1001 with GID 0, writes nothing to its filesystem, and listens on 3000.

Compose runs each container with a read-only root filesystem, a tmpfs at `/tmp`, all Linux capabilities dropped and `no-new-privileges`, which is the same posture the Kubernetes manifests enforce.

## Troubleshooting

**`ports are not available` on startup.** Another process owns that port. Use the port override variables above.

**A service never becomes healthy.** Run `docker compose logs <service>`. A crash on startup usually means a required variable is empty while `PUBLIC_ANON_MODE` is not `TRUE`.

**Build fails after changing dependencies.** Run `pnpm install` locally so `pnpm-lock.yaml` is up to date, then rebuild. The image installs with `--frozen-lockfile` and will refuse a stale lockfile.

**Build is slow every time.** Make sure BuildKit is enabled (`docker buildx version` should work). Without it the pnpm store cache mount is ignored.

**Reclaiming space.** `docker compose down --rmi local` removes the images; `docker builder prune` clears the build cache.
