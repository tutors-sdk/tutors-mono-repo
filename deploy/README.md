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

Optional build args: `NODE_VERSION` (default `22`), `VERSION`, `GIT_SHA` and
`BUILD_DATE` for the OCI labels and `GET /version`, and `SOURCE_DATE_EPOCH` for
reproducible static-file headers (see [Deterministic responses](#deterministic-responses)).
The build needs BuildKit (default in Docker 23+). Base images are fully
qualified (`docker.io/library/node`), so the same file builds under
Podman/Buildah and Quay's builders; `NODE_IMAGE` overrides the base for a
mirror.

```bash
docker build --build-arg APP_NAME=reader \
  --build-arg GIT_SHA=$(git rev-parse HEAD) \
  --build-arg BUILD_DATE=$(date -u +%FT%TZ) \
  --build-arg SOURCE_DATE_EPOCH=$(git log -1 --format=%ct) \
  -t tutors/reader .
```

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

### Metrics contract

Series names and label sets are the same from one start of an image to the
next under the same traffic. `scripts/checks/observability.ts`
(`metricsContractFindings`) pins this, in tier K and against every built image
in `pnpm check:container`.

| Group | Names | Compare? |
| --- | --- | --- |
| App-level | exactly `http_request_duration_seconds_{bucket,sum,count}`, `http_requests_total`, `http_requests_in_flight`. New app metrics are named `http_*` or `tutors_*` and added to `APP_SERIES`. | Names, label sets and counter deltas are deterministic for the same traffic. `_bucket` and `_sum` values move with the machine. |
| Process and runtime | everything else, always prefixed `process_` or `nodejs_` (the client library's default collectors: CPU, memory, fds, start time, heap spaces, GC, event loop lag and utilisation, active handles, `nodejs_version_info`) | Mask as a group with `^(process_\|nodejs_)`. Values describe the host and the moment; `nodejs_gc_duration_seconds{kind}` and `nodejs_active_*{type}` also gain label values as GC kinds and handle types first occur. |

Labels on app-level series are `method`, `route`, `status_code` and, on the
histogram, `le`. None carries a per-request or per-process value: there is no
pid, instance or request id label (Prometheus adds `instance` itself when it
scrapes). `route` is a SvelteKit route id or `unmatched`. Buckets are fixed at
0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5 and 10 seconds. The Grafana alert rules
in `observability/` query these names, so none of them is renamed lightly.

Requests that adapter-node answers before SvelteKit runs (files under
`/_app/immutable`, other static and prerendered files) are not counted, logged
or given a request id.

## Logs

In a container every line on stdout and stderr is one JSON object, from the
first line to the last. `installProcessLogging()` in each app's
`hooks.server.ts` routes through `@tutors/logger` whatever would otherwise be
plain text: `console.*` calls in dependencies (including adapter-node's
`Listening on ...` banner), uncaught exceptions and unhandled rejections
(logged with their stack, then exit code 1), and Node process warnings. A
multi-line message or stack is one string inside its line. Dev builds keep the
readable `[time] [app:level] message` format.

### Log contract

Every line starts with these keys, in this order, always present:

| Key | Type | Notes |
| --- | --- | --- |
| `timestamp` | ISO 8601 string | **variable** |
| `level` | `debug` \| `info` \| `warn` \| `error` | |
| `event` | string | the line's kind, from the table below |
| `message` | string | fixed text for every kind except `log` and `console` |
| `app` | `tutors-<app>` | |
| `environment` | `production` \| `development` | |
| `hostname` | string or null | **variable**; the pod or container name (`HOSTNAME`) |
| `pid` | number | **variable** |
| `requestId` | string or null | **variable**; null outside a request |

Then the fields of the line's `event`, again always all present and in this
order (null where a value is unknown):

| `event` | `message` | Fields after the core keys |
| --- | --- | --- |
| `service.start` | `Service starting` | `logLevel`, `node`, `version`, and in the reader `authMode` |
| `request.completed` | `request completed` | `method`, `path`, `route` (string or null), `status`, `duration_ms` (**variable**), `slow` (boolean, **variable**: `duration_ms` ≥ 2000, which also raises `level` to `warn`), `loadError` (boolean) |
| `request.error` | `Unhandled server error` | `method`, `path`, `route`, `status`, `reason`, `error`, `stack` (string or null). `warn` for a 404, otherwise `error` |
| `request.failed` | `request failed` | `method`, `path`, `route`, `duration_ms`, `error`, `stack`. A hook threw outside SvelteKit's error handling |
| `console` | the text that was printed | `consoleMethod` (`log`, `info`, `debug`, `warn`, `error`, `trace`) |
| `process.uncaughtException`, `process.unhandledRejection` | `Uncaught exception`, `Unhandled promise rejection` | `error`, `stack`; the process then exits 1 |
| `process.warning` | `Node process warning` | `warningName`, `error`, `stack` |
| `log` | free text | whatever context the `log.info(...)` call site passed; an `Error` argument becomes `error` and `stack` |

The fields whose value differs between two runs of one image under the same
traffic are exactly `timestamp`, `hostname`, `pid`, `requestId`,
`duration_ms`, `slow` and `stack` (frames name content-hashed build files).
They are listed in code as `VARIABLE_LOG_FIELDS`, next to `CORE_LOG_KEYS` and
`LOG_EVENT_FIELDS` in `packages/svelte/utils/logger/src`. Key names, key
order, types, `event`, `message`, `level` (apart from the `slow` case) and
line counts per event are stable. `pnpm check:container` checks the contract
against real container output.

Two kinds of output cannot be JSON and are outside the contract: anything
printed before the server module loads (a Node flag error, a missing
`build/index.js`), and V8's own fatal errors such as heap exhaustion, which
the runtime writes natively as it aborts.

### Request ids

The one correlation header is `x-request-id`. The request logger, first in
every app's hook sequence, takes the incoming value when it matches
`^[A-Za-z0-9._:-]{1,128}$` (an ingress or upstream already traced the request)
and otherwise generates a UUID. It stores the id on `event.locals.requestId`,
sets it exactly once on the response, and runs the rest of the request inside
an `AsyncLocalStorage` context, so every line logged while serving the request
carries the id, including lines from workspace packages that know nothing
about requests. Server-side Supabase calls made during a request forward the
id in `x-request-id` (`withRequestId`). `/healthz` probes get the header but no
log line.

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
