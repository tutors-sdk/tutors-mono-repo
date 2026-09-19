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
for the OCI labels and `GET /version`, and `SOURCE_DATE_EPOCH` for reproducible
static-file headers (see [Deterministic responses](#deterministic-responses)).
The build needs BuildKit (default in Docker 23+).

```bash
docker build --build-arg APP_NAME=reader \
  --build-arg GIT_SHA=$(git rev-parse HEAD) \
  --build-arg BUILD_DATE=$(date -u +%FT%TZ) \
  --build-arg SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) \
  -t tutors/reader .
```

## Run locally

A step-by-step walkthrough, including troubleshooting, is in
[`docs/LOCAL-CONTAINERS.md`](../docs/LOCAL-CONTAINERS.md).

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
| Metrics | `GET /metrics` in Prometheus text format (request histogram/counter, in-flight gauge, Node process metrics) |
| Build identity | `GET /version` returns `{"app","version","revision","built","clock"}`; the only route that answers the commit or build date |
| Request id | `x-request-id` response header (echoes a well-formed incoming one); the only per-request value in any header besides `Date` |
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
| `METRICS_TOKEN` | When set, `GET /metrics` requires `Authorization: Bearer <token>`; unset leaves it open |
| `HARNESS_NOW` | **Release harness only.** An ISO 8601 instant that freezes the clock the server stamps into responses and records. Never set it in a deployment |

`GIT_SHA` and `BUILD_DATE` are baked into the image from the build args of the
same name; nobody sets them at runtime.

## Deterministic responses

The release harness runs two stacks of these images side by side and diffs
what they answer, so anything that varies without a code change is noise in
every comparison. The image keeps that to a known, short list:

- **Clock.** Server code that stamps a time into a response or a stored record
  (`/healthz` `timestamp`, the time app's `last_synced_at` and sync-interval
  check) reads it from `now()` in `@tutors/runtime`. With `HARNESS_NOW` set to
  an ISO 8601 instant (`2026-09-16T09:05:00.000Z`) it answers that instant;
  otherwise the system clock. Log timestamps, metrics, request durations and
  everything Auth.js does with session expiry stay on the real clock: the seam
  never patches `Date`, so a frozen clock cannot keep an expired session alive.
  The image always runs with `NODE_ENV=production`, so the guard against
  running frozen by accident is that nothing sets the variable: it is absent
  from `deploy/k8s` and `compose.yaml` (a conformance test fails if it ever
  appears there), an invalid value is ignored, the app logs a `warn` line at
  startup while it is active, and `GET /version` reports `"clock": "frozen"`.
- **Headers.** Two identical requests answer identical headers except `Date`
  and `x-request-id` (the container smoke test checks this). Static files carry
  `ETag: W/"<size>-<mtime>"` and `Last-Modified`; pass
  `--build-arg SOURCE_DATE_EPOCH=$(git log -1 --format=%ct)` and every file's
  mtime is pinned to the commit time, so two builds of one commit agree.
  Without it they differ per build. There is no CSP nonce and no per-process id.
- **Build identity.** The commit and build date are answered by `GET /version`
  only. With `GIT_SHA` given, SvelteKit's build name (`/_app/version.json`, and
  the `__sveltekit_<hash>` global in each page) is the commit instead of the
  build timestamp, so rebuilding a commit changes nothing. The release version
  also appears in the footer (`Tutors v:16.2.2`, marked
  `data-tutors-build="version"`) and in the `Service starting` log line.

## Metrics

Every app serves `GET /metrics` on its normal port: `http_request_duration_seconds`,
`http_requests_total` and `http_requests_in_flight`, labelled by method, matched
route and status, plus the default Node.js process metrics. `/metrics` and the
`/healthz` probes are not counted. The route label is the SvelteKit route id,
so unmatched requests share one `unmatched` series.

Because the endpoint sits behind the public Route, set `METRICS_TOKEN` in
production and give the scraper the same value (Prometheus `authorization`,
ServiceMonitor `endpoints[].authorization`).

`observability/compose.yaml` starts Prometheus and Grafana, provisioned with
the data source, alert rules (error rate, p99 latency, target down) and a
contact point template. It scrapes the apps through their host ports, so it
runs alongside either the local stack or the staging stack:

```bash
cd observability && docker compose up -d   # Prometheus :9090, Grafana :3004
```

On a cluster with the Prometheus Operator (OpenShift user-workload
monitoring), add the ServiceMonitor component to an overlay:

```yaml
components:
  - ../../components/servicemonitor
```

The pod template also carries `prometheus.io/scrape` annotations for
annotation-driven scrapers.

## Kubernetes / OpenShift

`deploy/k8s/base` holds a shared Deployment, Service, ConfigMap and
PodDisruptionBudget. Each overlay under `deploy/k8s/overlays/<app>` sets the
image, the name prefix, labels and the public `ORIGIN`.

```bash
kubectl kustomize deploy/k8s/overlays/reader   # render
oc apply -k deploy/k8s/overlays/reader          # deploy
```

Before applying, replace `registry.example.com/tutors/<app>` in the overlay
with the real image reference and fill in the ConfigMap values. Image tags are
pinned to the release version in the root `package.json` (never `latest`); the
release checklist bumps them together. The reader overlay expects a
`reader-tutors-app-oauth` Secret; copy `overlays/reader/secrets.yaml.example`
to `secrets.yaml` (git-ignored) and apply it separately. Every app also reads
an optional `<app>-tutors-app-secrets` Secret for `METRICS_TOKEN`
(`base/secrets.yaml.example`); the time app's example adds `MOODLE_WS_TOKEN`.

`pnpm check:k8s` renders every overlay and checks it against the policies in
`scripts/checks/conformance.ts`: pinned images, requests and limits, probes,
and a security context `restricted-v2` admits. CI also validates the rendered
output with kubeconform. Every variable the apps read must appear both in
`.env.example` and in these manifests, or the conformance tests fail.

The pod spec runs as non-root with a read-only root filesystem, all
capabilities dropped and the default seccomp profile, which satisfies the
OpenShift `restricted-v2` SCC without any extra grants.
