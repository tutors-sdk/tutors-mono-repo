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

## Published images

The `Container Image Build` workflow (`.github/workflows/image-build.yml`)
builds all four apps from this Dockerfile and publishes them to
`quay.io/tutors-sdk/tutors-<app>` as multi-arch images (`linux/amd64` and
`linux/arm64`, the arm64 half built under QEMU).

| Event | Tags pushed |
| --- | --- |
| Pull request (touching the build context) | none; amd64 build and scan only |
| Push to `main` | `sha-<short>`, `main` |
| Push to an `rc/**` branch | `sha-<short>`, the branch name with `/` as `-` (`rc/16.2.0` gives `rc-16.2.0`) |
| Release tag `vX.Y.Z` | `X.Y.Z`, `X.Y`, `latest`, `sha-<short>`: **promoted** from the release candidate (the same digest, not rebuilt) when one matches, see below |
| Prerelease tag `vX.Y.Z-rc.N` | `X.Y.Z-rc.N`, `sha-<short>` |
| Backfill: dispatched from `main` with `release_tag=vX.Y.Z` | `X.Y.Z`, `X.Y`, `sha-<short>` (never `latest`) |

`latest` is the newest full release and `main` is the tip of the default
branch. A prerelease tag never moves `latest` or `X.Y`. `sha-<short>` is the
first seven characters of the commit.

A release tagged before this workflow existed has no copy of it, so
dispatching the workflow on that tag cannot publish it. Backfill it from
`main` instead; the run checks out the tag and builds that tag's own
Dockerfile:

```bash
gh workflow run image-build.yml --ref main -f release_tag=v16.2.2
```

`release_tag` is forgiving about how it was typed: `V16.2.2`, `16.2.2` and a
stray space all mean `v16.2.2` (the Actions form on a phone capitalises the
first letter). Anything that is still not a release tag is refused.

A backfill publishes what production already runs, so its Trivy scan
reports findings without stopping the push. Its signing identity ends in
`@refs/heads/main`, not the tag.

### Promotion of the release candidate

The release harness judges the `X.Y.Z-rc.N` images, so a release tag ships
those images instead of building new ones. On `vX.Y.Z`, per app,
`scripts/promote-image.ts` looks up the highest `X.Y.Z-rc.N` in the app's
repository and promotes it only when

1. the git tree of `vX.Y.Z-rc.N` equals the git tree of the `vX.Y.Z` commit
   (the commit may differ, a release branch merged to `main` has its own sha;
   the tree may not),
2. the image's `org.opencontainers.image.revision` label is the rc commit, and
3. its cosign signature verifies, made by `image-build.yml` at
   `refs/tags/vX.Y.Z-rc.N`.

Promotion scans the candidate's digest with Trivy (same gate as a build), then
retags that digest as `X.Y.Z`, `sha-<short>`, and after verifying them `X.Y` and
`latest`, with `docker buildx imagetools create`. No image is built, so the
digest, signature and SBOM attestation are the candidate's, and
`pnpm deploy:pin X.Y.Z`, the harness's `HARNESS_PRODUCTION_TAG` and the digests
sent with its `deployed` event equal the digest the harness judged. Do not add a
commit between the last candidate and the release tag.

When an app cannot be promoted the workflow rebuilds it as before and marks the
run: a `::warning::` titled `REBUILT — this image is not the one the release
harness judged`, the same line in the job summary, and `promoted=false` on the
`Decide whether to promote the release candidate` step. A rebuilt image has a
`version` label without `-rc` and a digest that differs from the candidate's;
a promoted one reads `X.Y.Z-rc.N`. Dispatching the workflow on the release tag
with `require_promotion=true` fails instead of rebuilding. Details and the
decision table are in
[Release-Strategy.md](../guides/Release-Strategy.md#final-tag-the-candidate-ships);
`pnpm promote:image plan --app reader --ref vX.Y.Z --dry-run` shows what a tag
would do.

Every other publishing run, and a release tag that could not be promoted, does
the following, per app, in this order:

1. Builds the `linux/amd64` image locally and scans it with Trivy. CRITICAL
   and HIGH findings with an available fix fail the job, before anything has
   been pushed.
2. Builds `linux/amd64,linux/arm64` (the amd64 layers are the ones just
   scanned) and pushes every tag to one multi-arch digest, with the
   `GIT_SHA`, `BUILD_DATE` and `VERSION` build args set. `VERSION` is the
   semver on a `v*` tag and `sha-<short>` otherwise.
3. Signs that digest with cosign, keyless: the certificate is issued to the
   workflow's GitHub OIDC identity, and no signing key exists to leak.
4. Generates an SPDX JSON SBOM with syft and attaches it to the digest as a
   signed in-toto attestation (`cosign attest --type spdxjson`). The SBOM is
   also kept as a workflow artifact. It describes the amd64 image.

Pull requests run only step 1, with no registry login and no OIDC token.

Pushing needs two repository secrets holding a Quay.io robot account with
write access to the four repositories: `QUAY_USERNAME` and `QUAY_PASSWORD`.
Signatures and attestations are stored next to the image as OCI referrers,
so the same robot account writes them.

### Verifying an image

With cosign 3 or later (tag or digest both work; cosign resolves the tag to
its digest and checks the signature made over that digest):

```bash
cosign verify \
  --certificate-identity-regexp '^https://github.com/tutors-sdk/tutors-mono-repo/\.github/workflows/image-build\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  quay.io/tutors-sdk/tutors-reader:<tag>

cosign verify-attestation --type spdxjson \
  --certificate-identity-regexp '^https://github.com/tutors-sdk/tutors-mono-repo/\.github/workflows/image-build\.yml@' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com \
  quay.io/tutors-sdk/tutors-reader:<tag>
```

Both print the verified payload as JSON and exit non-zero when nothing
matches. To read the SBOM, decode the attestation payload:

```bash
cosign verify-attestation --type spdxjson ... quay.io/tutors-sdk/tutors-reader:<tag> \
  | jq -r '.payload | @base64d | fromjson | .predicate' > sbom.spdx.json
```

The identity ends in the git ref that ran the workflow
(`...image-build.yml@refs/tags/v16.3.0`, `@refs/heads/main`). A promoted
release is the candidate's image, so its identity names the candidate's tag
(`@refs/tags/v16.3.0-rc.2`), not the release tag. To accept release and
candidate builds only, tighten the end of the regexp to `@refs/tags/v.+$`.

## Staging stack

`deploy/staging/compose.yaml` runs the four published images on one host,
with the same read-only, capability-dropped posture as the local stack. It
builds nothing, so `IMAGE_TAG` selects exactly what to run (default `main`):

```bash
cd deploy/staging
cp .env.example .env               # Supabase, OAuth, Moodle, origins
IMAGE_TAG=16.3.0-rc.1 docker compose up -d
docker compose pull && docker compose up -d   # roll forward
```

Set each `*_ORIGIN` to the URL users reach the app on; adapter-node uses it
for absolute URLs and CSRF checks.

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
  check, and which week of a course calendar is the current one, which is
  rendered into every course page) reads it from `now()` in `@tutors/runtime`. With `HARNESS_NOW` set to
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
  only, on every app. SvelteKit's own build name (`/_app/version.json`, the
  client bundle and, hashed again, the `__sveltekit_<hash>` global in each page)
  is a SHA-256 prefix of `GIT_SHA` when it is given, so rebuilding a commit
  changes nothing and the commit itself is not in any of them; without it
  SvelteKit falls back to the build timestamp. The release version also
  appears in the footer (`Tutors v:16.2.2`, marked `data-tutors-build="version"`),
  compiled into the client bundle that renders it, and in the `Service starting`
  log line; nowhere else. `pnpm check:build-identity` starts each built app with
  a sentinel commit and build date and fails if either appears in a response
  header, page, error page, script, `/_app/version.json` or any built file;
  `pnpm check:container` runs the same crawl against the image.
- **What is deliberately left.** `Date` (Node sets it on every response),
  `x-request-id` (a per-request correlation id; the harness asserts it is
  present instead of comparing it) and the connection headers a proxy rewrites.
  Static files pinned to the commit time still differ between two *different*
  commits, since a change there is a change of `ETag` and `Last-Modified`;
  only document responses' headers are compared across releases, and the
  server-rendered pages' `ETag` is a hash of the body, so it moves only when
  the page does. Chunk names are content hashes and appear in `Link` headers.

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

`message` is fixed text: a collector, and the release harness, group and diff
lines by it, so anything that varies per request or per failure goes in a
field, never into the message. Write `log.error("Error fetching course", { courseId, url })`,
not `` log.error(`Error fetching ${url}`) ``, and never pass an `Error` or a
variable as the first argument (its text becomes the message). The observability
contract test (`log message stability`) fails on a log call in product code whose
first argument is not a string literal. The `console` event is the one
exception: it carries whatever a third-party library printed.

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

Each overlay points at `quay.io/tutors-sdk/tutors-<app>`, which the image
build workflow publishes; to deploy from a mirror, change `images[].newName`.
Each overlay pins its image by digest, with the release tag beside it:

```yaml
images:
  - name: tutors-app
    newName: quay.io/tutors-sdk/tutors-reader
    newTag: "16.2.2"
    digest: sha256:7567d5927767bd39b7991a586d594f6c310387471109a456d2cff49fa12488cb
```

Kustomize renders `quay.io/tutors-sdk/tutors-reader:16.2.2@sha256:7567...`: the
container runtime pulls the digest and ignores the tag, so a tag pushed again
cannot change what is deployed, and the tag stays for people and for
`release-dispatch.yml`, which reads it as the production tag. The digest is the
multi-arch index digest that the image build signs. Never `latest`, never a tag
alone: `pnpm check:k8s` fails a rendered image without a digest.

Because a release tag promotes the judged release candidate rather than
rebuilding it (see [Promotion of the release candidate](#promotion-of-the-release-candidate)),
the digest that `pnpm deploy:pin X.Y.Z` writes is the `X.Y.Z-rc.N` digest the
release harness judged. Its signature names `image-build.yml` at the candidate's
ref (`@refs/tags/vX.Y.Z-rc.N`), while an app that had to be rebuilt is signed at
`@refs/tags/vX.Y.Z`; the pin verification (`deploy:pin` and
`check:deploy-pins --registry`) accepts `image-build.yml` at any ref, so it
passes for both.

The overlays name what production runs, so they move when a release is
deployed, not when it is cut. After the `v<version>` tag is pushed and the image
build has published it:

```bash
pnpm deploy:pin 16.3.0            # resolve each tag's digest, verify its signature, rewrite the four overlays
pnpm deploy:pin 16.3.0 --dry-run  # the same, changing nothing
pnpm check:deploy-pins            # form of the pins: a digest and a release tag on every overlay, one release across all four
pnpm check:deploy-pins --registry # and: each tag still resolves to its digest, and the digest is signed by image-build.yml
```

Open a pull request with the result. `.github/workflows/deploy.yml` runs the
registry check on it and again on `main`, and once the rollout is confirmed it
sets the release harness's `HARNESS_PRODUCTION_TAG` variable and dispatches its
`deployed` event, see [Deploy and post-deploy](../guides/Release-Strategy.md#deploy-and-post-deploy).
To try an unreleased build locally, render an overlay and swap the image on the
command line (`kubectl kustomize` output piped through your own edit); do not
commit it. Fill in the ConfigMap values before
applying. The reader overlay expects a `reader-tutors-app-oauth` Secret; copy
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

### Route and Ingress

The overlays expose nothing outside the cluster. The entry point is a
kustomize component per substrate, and `deploy/k8s/variants/<substrate>/<app>`
is the overlay plus that component, so either renders without editing a file:

```bash
kubectl kustomize deploy/k8s/variants/openshift/reader   # overlay + Route
kubectl kustomize deploy/k8s/variants/kind/reader        # overlay + Ingress
oc apply -k deploy/k8s/variants/openshift/reader
```

| Component | Renders |
| --- | --- |
| `components/route` | `route.openshift.io/v1` Route, edge TLS with the router's certificate, plain HTTP redirected, to the Service's `http` port |
| `components/ingress` | `networking.k8s.io/v1` Ingress, `ingressClassName: nginx`, no TLS block, to the Service's `http` port |

The host is stated once, in the overlay's `ORIGIN`. The component copies the
host out of it (`https://reader.tutors.dev` becomes `reader.tutors.dev`) and
takes its name, labels and backend from the rendered Service. For that it has
to sit one layer above the overlay, as the variants do:

```yaml
resources:
  - ../../../overlays/reader
components:
  - ../../../components/route
```

Listing it in the overlay's own `components:` does not work: kustomize runs a
component before that kustomization's patches and `namePrefix`, so the host
would be the base `tutors.dev` and the backend the unprefixed Service.
`pnpm check:k8s` fails such a rendering (`host-not-origin`,
`backend-service-not-rendered`). The same ordering applies to a changed host:
patch `ORIGIN` in a layer below the component (a kustomization over the
overlay, then one that adds the component), or patch both `ORIGIN` and the
host in a kustomization over the variant and let the check confirm they agree.
An `ORIGIN` with a port needs the second form, since a host cannot carry one.

adapter-node uses `ORIGIN` as given, so an `https://` origin needs TLS in
front of the pod: the Route terminates it, while the Ingress needs either a
TLS block or an `http://` `ORIGIN`. Another class or TLS is a patch in a
kustomization over `variants/kind/<app>`:

```yaml
patches:
  - target:
      kind: Ingress
    patch: |
      - op: replace
        path: /spec/ingressClassName
        value: traefik
      - op: add
        path: /spec/tls
        value:
          - hosts: [reader.tutors.dev]
            secretName: reader-tutors-app-tls
```

The base ConfigMap already sets `PROTOCOL_HEADER`, `HOST_HEADER`,
`ADDRESS_HEADER` and `XFF_DEPTH: "1"` for the `x-forwarded-*` headers that the
OpenShift router and ingress-nginx add, so the client address and protocol
survive one proxy hop; raise `XFF_DEPTH` if a load balancer in front adds
another.

`pnpm check:k8s` renders the variants along with the overlays and adds entry
point policies: the host equals the `ORIGIN` host, the backend is a rendered
Service and port, a Route terminates TLS and redirects plain HTTP, an Ingress
names its class and any TLS block covers its host. kubeconform skips the Route
kind only, as it is not in the Kubernetes schemas.
