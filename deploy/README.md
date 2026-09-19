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
| Release tag `vX.Y.Z` | `X.Y.Z`, `X.Y`, `latest`, `sha-<short>` |
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

A backfill publishes what production already runs, so its Trivy scan
reports findings without stopping the push. Its signing identity ends in
`@refs/heads/main`, not the tag.

Every publishing run does the following, per app, in this order:

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
(`...image-build.yml@refs/tags/v16.3.0`, `@refs/heads/main`). To accept
release builds only, tighten the end of the regexp to `@refs/tags/v.+$`.

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

Each overlay points at `quay.io/tutors-sdk/tutors-<app>`, which the image
build workflow publishes; to deploy from a mirror, change `images[].newName`.
Image tags are pinned to the release version in the root `package.json`
(never `latest`); the release checklist bumps them together, and the workflow
publishes that tag from the `v<version>` git tag. To try an unreleased build,
set `newTag` to `sha-<short>` locally. Fill in the ConfigMap values before
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
