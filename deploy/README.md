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

Optional build args: `NODE_VERSION` (default `22`), and `VERSION`, `GIT_SHA`
and `BUILD_DATE` for the OCI labels. The build needs BuildKit (default in
Docker 23+). Base images are fully qualified (`docker.io/library/node`), so
the same file builds under Podman/Buildah and Quay's builders; `NODE_IMAGE`
overrides the base for a mirror.

## Registry

Published images live on Quay, one repository per app:

| App | Image |
| --- | --- |
| reader | `quay.io/tutors-sdk/tutors-reader` |
| catalogue | `quay.io/tutors-sdk/tutors-catalogue` |
| live | `quay.io/tutors-sdk/tutors-live` |
| time | `quay.io/tutors-sdk/tutors-time` |

Quay repositories are exactly `quay.io/<org>/<repo>` with no nested path, which
is why the app is part of the repository name rather than a path segment. The
root `compose.yaml` builds `tutors/<app>:local` by default and takes the
published names from two variables, so the same file builds, pushes or runs
them:

```bash
export TUTORS_IMAGE_PREFIX=quay.io/tutors-sdk/tutors- TUTORS_TAG=16.2.2
GIT_SHA=$(git rev-parse HEAD) BUILD_DATE=$(date -u +%FT%TZ) docker compose build
docker compose push                                  # needs `docker login quay.io`
docker compose pull && docker compose up --no-build  # run what was published
```

Every image carries `org.opencontainers.image.version`, `.revision`,
`.created` and `.source`; Quay shows them on the tag page and the release
harness reads `revision` and `version` to trace a report to a commit.

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

The overlays reference `quay.io/tutors-sdk/tutors-<app>`; to deploy from a
mirror, change `images[].newName`. Fill in the ConfigMap values before
applying. Image tags are pinned to the release version in the root
`package.json` (never `latest`); the release checklist bumps them together.
The reader overlay expects a `reader-tutors-app-oauth` Secret; copy
`overlays/reader/secrets.yaml.example`
to `secrets.yaml` (git-ignored) and apply it separately. Every app also reads
an optional `<app>-tutors-app-secrets` Secret for `METRICS_TOKEN`
(`base/secrets.yaml.example`); the time app's example adds `MOODLE_WS_TOKEN`.

`pnpm check:k8s` renders every overlay and checks it against the policies in
`scripts/checks/conformance.ts`: registry-qualified and pinned images (a short
name such as `tutors/reader` is refused by CRI-O, and a nested Quay path cannot
exist), requests and limits, probes,
and a security context `restricted-v2` admits. CI also validates the rendered
output with kubeconform. Every variable the apps read must appear both in
`.env.example` and in these manifests, or the conformance tests fail.

The pod spec runs as non-root with a read-only root filesystem, all
capabilities dropped and the default seccomp profile, which satisfies the
OpenShift `restricted-v2` SCC without any extra grants.
