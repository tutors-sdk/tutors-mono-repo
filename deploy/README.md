# Deploying Tutors as containers

One `Dockerfile` at the repo root builds any of the four SvelteKit apps
(`reader`, `catalogue`, `live`, `time`) into a self-contained Node.js image.
Runtime configuration is read from the environment, so the same image is
promoted through every environment and no secret is baked into a layer.

## Build

```bash
docker build --build-arg APP_NAME=reader -t tutors/reader .
docker build --build-arg APP_NAME=catalogue -t tutors/catalogue .
docker build --build-arg APP_NAME=live -t tutors/live .
docker build --build-arg APP_NAME=time -t tutors/time .
```

Optional build args: `NODE_VERSION` (default `22`), `GIT_SHA` and `BUILD_DATE`
for the OCI labels. The build needs BuildKit (default in Docker 23+).

## Run locally

```bash
docker compose up --build          # all four apps on ports 3000-3003
docker compose up --build reader   # one app
```

Compose reads an optional `.env` in the repo root (see `.env.example`).
Without one the apps start in anonymous mode (`PUBLIC_ANON_MODE=TRUE`), which
needs no Supabase project. If a host port is taken, override it, for example
`READER_PORT=3010 docker compose up reader`.

## Image contract

| Item | Value |
| --- | --- |
| Port | `3000` (`PORT` env) |
| User | UID `1001`, GID `0` (OpenShift arbitrary-UID compatible) |
| Filesystem | read-only safe; nothing is written at runtime |
| Liveness | `GET /healthz/live` returns `{"status":"ok"}` with no dependencies |
| Readiness | `GET /healthz` also reports Supabase reachability |
| Entrypoint | `node build/index.js` (SvelteKit adapter-node) |

Environment variables the server reads at startup:

| Variable | Purpose |
| --- | --- |
| `ORIGIN` | Public URL of the app, required for correct absolute URLs and CSRF checks |
| `PROTOCOL_HEADER`, `HOST_HEADER`, `ADDRESS_HEADER`, `XFF_DEPTH` | Trust proxy headers when behind a Route or Ingress |
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | Supabase project; omit both to run without it |
| `PUBLIC_ANON_MODE` | `TRUE` disables authentication and analytics |
| `PRIVATE_AUTH_GITHUB_ID`, `PRIVATE_AUTH_GITHUB_SECRET`, `PRIVATE_AUTH_SECRET` | GitHub OAuth for the reader app |
| `MOODLE_WS_URL`, `MOODLE_WS_TOKEN`, `MOODLE_WS_REST_FORMAT`, `SYNC_INTERVAL_MINUTES` | Moodle sync for the time app |
| `LOG_LEVEL` | `debug`, `info`, `warn` or `error` |

## Kubernetes / OpenShift

`deploy/k8s/base` holds a shared Deployment, Service, ConfigMap and
PodDisruptionBudget. Each overlay under `deploy/k8s/overlays/<app>` sets the
image, the name prefix, labels and the public `ORIGIN`.

```bash
kubectl kustomize deploy/k8s/overlays/reader   # render
oc apply -k deploy/k8s/overlays/reader          # deploy
```

Before applying, replace `registry.example.com/tutors/<app>` in the overlay
with the real image reference and fill in the ConfigMap values. The reader
overlay expects a `reader-tutors-app-oauth` Secret; copy
`overlays/reader/secrets.yaml.example` to `secrets.yaml` (git-ignored) and
apply it separately.

The pod spec runs as non-root with a read-only root filesystem, all
capabilities dropped and the default seccomp profile, which satisfies the
OpenShift `restricted-v2` SCC without any extra grants.
