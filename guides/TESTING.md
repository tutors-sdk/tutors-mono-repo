# Testing Guide

The long form. [TESTING-OVERVIEW.md](./TESTING-OVERVIEW.md) is the one-page entry point and
[../tests/TESTING.md](../tests/TESTING.md) maps each `tests/` directory to a tier, a runner
and a command. This document explains, per tier, what it protects, where its code lives, how
to run it on a laptop, how it proves it can fail, and which baseline it ratchets.

Two rules shape everything here. Every failure class has exactly one owning tier, and no
check is trusted until it has been watched failing against a deliberately broken fixture.
Where a tier's suite has a `negative fixtures` block, that is what it is for.

## Running it locally

```bash
pnpm install
pnpm lint
pnpm test                 # vitest run: everything under tests/ except e2e, e2e-stack, release, fuzz
pnpm test:fuzz            # the property suites, threads pool
pnpm test:runway          # only the repo-level suites
pnpm exec vitest          # watch mode
pnpm exec vitest run tests/unit/utils/i18n.test.ts
pnpm exec vitest run -t "median"
```

`pnpm test` needs no services: `tests/support/no-network.ts` is a setup file for both the
root and fuzz configs, and any `fetch`, `http(s)`, `net` or `tls` connection to anything but
loopback throws. A test that genuinely needs the network calls `allowNetwork("reason")` or is
listed with a reason in `NETWORK_ALLOWED_FILES`.

### Windows and Git Bash

| Symptom | Cause and fix |
|---|---|
| `TZ=Europe/Dublin pnpm test` appears to pass but tests the host zone | MSYS drops or rewrites `TZ` before Node sees it. Use `pnpm test:tz`, which spawns Vitest with both `TZ` and `TZ_MATRIX_ZONE` and asserts in the suite that the zone really applied |
| `pnpm api-report:check` reports all three reports as fully rewritten | Git checked `etc/*.api.md` out with CRLF and the generator writes LF, so every line differs. CI on Linux is unaffected. Judge the real diff there, or compare with `git diff --ignore-cr-at-eol` after `pnpm api-report` |
| `pnpm check:load` and the other Docker checks | Docker Desktop maps volume ownership, so the k6 `--user` flag the Linux runner needs is skipped on Windows. Keep other compose stacks off ports 3000–3003 and 8080 before starting the e2e stack |
| `pnpm check:k8s`, `pnpm check:container`, `pnpm test:e2e:stack` | Need Docker (and `kustomize` via the script) running. They are CI jobs, not part of the expected local run |

### `pnpm check` is broken at the root

The root `check` script runs `npm run check --workspace=apps/reader`, but the repo has no
npm `workspaces` field — it is a pnpm workspace — so npm answers `No workspaces found`. Use
`pnpm --filter tutors-reader check`, which is what CI's type-check steps run. `rc-validation.yml`
Gate 1 still calls the broken form.

## Tier A — structure

**Protects** the layering in [../ARCHITECTURE.md](../ARCHITECTURE.md): nothing imports up a
layer, apps do not import each other, no relative import crosses a workspace, no cycle spans
packages, `deno.json` and `package.json` agree for every JSR package, and no file, export or
dependency is dead.

**Lives in** `.dependency-cruiser.cjs` (layers and rules), `knip.json`,
`scripts/checks/architecture.ts`, `scripts/checks/manifest-parity.ts`, `scripts/checks/knip.ts`,
and the suites in `tests/architecture/`.

```bash
pnpm exec vitest run tests/architecture
pnpm check:knip
pnpm architecture-report      # every violation, baselined ones included
```

**Proves it can fail** against `tests/architecture/fixtures/workspace/`, a miniature repo whose
files deliberately reach up a layer, import another app, use a cross-workspace relative import
and form a cycle; the manifest-parity suite feeds it manifests with a bumped version, a rename,
an added export and a dependency on another major; the knip suite feeds it output with no JSON
report at all.

**Baselines** `known-violations.txt`, `known-manifest-drift.txt`, `known-knip.txt`.

## Tier B — logic and properties

**Protects** the behaviour of the JSR packages (`model`, `gen`, `time`) and the Svelte packages
at the function level, plus the invariants that must hold for *any* course or calendar, in any
timezone.

**Lives in** `tests/unit/**` (62 files, grouped by package), `tests/fuzz/**`,
`tests/support/arbitraries/course-tree.ts` (the shared course arbitrary: generator-shaped JSON
with `{{COURSEURL}}` routes, nested composites, lab steps, Unicode and hidden learning objects),
`vitest.config.ts` and `vitest.config.fuzz.ts`.

```bash
pnpm exec vitest run tests/unit
pnpm test:fuzz
FUZZ_RUNS=1000 pnpm test:fuzz                          # what RC validation runs
FUZZ_SEED=20260916 FUZZ_PATH=3:2:0 pnpm test:fuzz      # replay a reported failure
pnpm test:tz                                           # UTC, Europe/Dublin, Pacific/Auckland
pnpm test:tz -- tests/unit/time                        # restrict the unit part
```

Fuzz has its own config because fast-check v4 property generation crashes Vitest's default
fork workers ([#8](https://github.com/tutors-sdk/tutors-mono-repo/issues/8)); the fuzz config
forces the threads pool, disables file parallelism and raises the timeout to 60 s. Properties
run against the real package code, never a copy, and each property is a factory over the
implementation it checks.

**Proves it can fail** by running the same property against a deliberately broken wrapper and
asserting that fast-check reports a replayable seed and path.

**Baselines** `tests/fuzz/known-timezone-failures.txt`.

**Coverage** is enforced by `pnpm test:coverage` (and `vitest run --coverage` in CI) against the
thresholds in `vitest.config.ts`: statements 55, branches 50, functions 65, lines 55. These are
the real numbers, set where the suite is rather than where it should be; raise them as the suite
grows.

## Tier C — generated output

**Protects** the generator. Any change in what `packages/jsr/gen` produces for a fixed corpus
must be claimed, so silent changes to course JSON, zips or the rendered site cannot ship.

**Lives in** `scripts/checks/generator-diff.ts`, `scripts/checks/generator-compare.ts`,
`tests/generator/corpus/synthetic-course/` (one course covering typical topics, panels, media,
empty and hidden units, Unicode filenames), `tests/generator/corpus.yaml` (the pinned public
courses used nightly), `tests/generator/claims.yaml` and `tests/generator/generator-compare.test.ts`.

```bash
pnpm exec vitest run tests/generator
pnpm check:generator-diff --plant                    # self-test: a planted one-character change
pnpm check:generator-diff --base origin/main
pnpm check:generator-diff --base origin/main --approve-broad
```

Output is normalised before comparison — zip timestamps and compression, JSON key order, the
checkout path, line endings — and every mask carries a reason. Differences are reported as
hunks addressed by id, so inserting one learning object is one hunk rather than a cascade.
Each hunk must match a claim in `claims.yaml`; a claim broad enough to hide unrelated change
needs the `approve-broad-claim` label on the PR.

**Proves it can fail** with the planted template change (`--plant`), which CI runs as a step
before the real comparison.

## Tier G — user journeys against built images

**Protects** the journeys a person actually walks, in a real browser, against the **built
container images** — not `vite dev` — with a fixture course server so GitHub and Netlify are
not dependencies. It also owns the axe and reduced-motion audits at every page of every journey.

**Lives in** `playwright.e2e-stack.config.ts` and `tests/e2e-stack/`. Read
[../tests/e2e-stack/README.md](../tests/e2e-stack/README.md) for the compose services, the
fixture course, the port and URL overrides and the file-by-file map; it is not repeated here.

```bash
pnpm e2e:stack:fixture                               # needs Deno
docker compose build reader catalogue live           # root compose.yaml tags them tutors/<app>:local
pnpm e2e:stack:up
pnpm test:e2e:stack --project=chromium --project=webkit
pnpm test:e2e:stack:ratchet
pnpm e2e:stack:down
```

Journeys select by role and accessible name only, and never retry: a journey that needs a retry
is a finding. PR runs chromium and webkit; the nightly runs firefox and mobile.

**Proves it can fail** with `tests/e2e-stack/journeys/negative.journey.spec.ts`, a set of
`test.fail()` journeys that both demonstrate a journey can fail and pin known product bugs.

**Baselines** `a11y-known-violations.txt` and `reduced-motion-known.txt`, keyed
`<project> | <page> :: <finding>`, checked for stale lines by `pnpm test:e2e:stack:ratchet`.

## Tier J — platform conformance

**Protects** the deployable: every kustomize overlay renders, validates against the Kubernetes
schemas and satisfies the restricted-SCC policies; each overlay's image tag equals the root
`package.json` version; the image runs under an arbitrary UID with a read-only root filesystem
and only the values in `.env.example`; and every env var the code reads is documented in both
`.env.example` and the manifests.

**Lives in** `scripts/checks/conformance.ts`, `scripts/checks/k8s-conformance.ts`,
`scripts/checks/container-smoke.ts`, `tests/conformance/`, `deploy/k8s`.

```bash
pnpm exec vitest run tests/conformance
pnpm check:k8s                     # render overlays, apply policies
pnpm check:k8s --out rendered      # also write manifests for kubeconform
docker build --build-arg APP_NAME=reader -t tutors/reader:local .
pnpm check:container --image tutors/reader:local
```

**Proves it can fail** with `tests/conformance/fixtures/faulty-image` — `FIXTURE_FAULT=readonly`
writes to its root filesystem and `FIXTURE_FAULT=uid` insists on UID 1001, both run through
`--expect-fail` in CI — and `tests/conformance/fixtures/invalid-manifest.yaml`, which kubeconform
must reject.

## Tier K — observability contracts

**Protects** the ability to debug production: every log line matches the schema, every line of a
failed request carries the caller's request id, exactly one error line carries a stack, each app's
hooks put the request logger first, and every metric a provisioned Grafana alert queries exists in
`/metrics`.

**Lives in** `scripts/checks/observability.ts`, `tests/observability/observability-contracts.test.ts`,
`observability/`, and the request logger in `packages/svelte/logger`.

```bash
pnpm exec vitest run tests/observability
pnpm check:container --image tutors/reader:local     # the same contract against the image
```

**Proves it can fail** with negative fixtures for a bad level, a completion line missing its
request id, a non-JSON line, a load that throws inside a 200 `__data.json` response, an
uncorrelated line, a silently swallowed failure, a double-logged failure, a logger that is not
first, a bare `handleError`, and a renamed metric — which must name the alert it broke.

## Tier L — performance and capacity

**Protects** four ceilings: per-app client bundle size, Lighthouse floors on three reader pages,
request latency and error rate under load, and memory growth over a soak.

**Lives in** `scripts/checks/bundle-budget.ts`, `scripts/checks/lighthouse.ts`,
`scripts/checks/load-test.ts`, `scripts/checks/lib/stats.ts`, `tests/performance/` (with
`bundle-budgets.json`, `lighthouse.json`, the k6 scripts under `k6/` and an isolated Lighthouse
runner under `lighthouse/`). See [../tests/performance/README.md](../tests/performance/README.md)
for how samples become baselines.

```bash
pnpm exec vitest run tests/performance
SVELTEKIT_ADAPTER=node pnpm --filter "tutors-reader..." build && pnpm check:bundle
pnpm check:load --image tutors/reader:ci --rate 50 --duration 3m --runs 3
pnpm check:load --image tutors/reader:ci --script reader-soak.js --rate 5 --duration 45m
pnpm check:lighthouse --image tutors/reader:ci
```

Timings are never compared run to run: medians of repeated runs are compared against a noise
band derived from a scaled median absolute deviation, so one slow run on a busy runner is not a
regression. k6 runs as the runner's own uid because the temporary output directory is created
0700; Docker Desktop maps ownership, so Windows needs nothing.

**Proves it can fail** with negative fixtures for a chunk over the largest-chunk ceiling, totals
over their ceilings, an app with no budget, a median score below its floor, a Lighthouse runtime
error, steady memory growth after warm-up, a soak whose late p95 doubled, and a 30% slower
candidate; CI also runs `pnpm check:load --env P95_MS=0 --expect-fail` to prove the k6 thresholds
bite.

## Tier M — security contracts

**Protects** the response and request surface: the header contract per app, cookie flags, the
SvelteKit cross-site form check, an inventory of every mutating route with who may call it, and
dependency advisories.

**Lives in** `scripts/checks/security.ts`, `scripts/checks/dependency-audit.ts`,
`tests/security/` (`header-contract.json`, `mutating-routes.txt`, `audit-allowlist.json`).

```bash
pnpm exec vitest run tests/security
pnpm check:audit                       # every advisory must be fixed or allow-listed
pnpm check:audit --base-dir base       # PR mode: only advisories this branch adds
pnpm check:container --image tutors/reader:local --app reader   # headers, cookies, CSRF
```

A new `POST`/`PUT`/`PATCH`/`DELETE` endpoint or form action fails the suite until it is listed in
`mutating-routes.txt` with its callers. Authorisation itself — whether the right person may call
it — is tier F, and is not built yet.

**Proves it can fail** with negative fixtures for a dropped CSP, a weakened frame policy, a short
HSTS, each missing cookie flag, `SameSite=None` without `Secure`, a disabled origin check, an
unlisted route, a stale inventory entry and a malformed audit allowance; CI also smokes an image
with no security headers through `--expect-fail`.

**Baselines** `known-response-gaps.txt`.

## Tier N — completeness

**Protects** the things that are individually small and collectively fatal: translations (missing,
orphan, blank, unknown `t("key")`, undeclared locale), theme base tokens and themes offered but
never loaded, icon libraries missing an icon the base library defines, dead relative links and
dead anchors in tracked Markdown, and app READMEs that disagree with their `@tutors/*` dependencies.

**Lives in** `scripts/checks/completeness.ts` and `tests/completeness/`.

```bash
pnpm exec vitest run tests/completeness
```

This is the tier that fails when documentation rots, so run it after editing any Markdown.

**Proves it can fail** with fixture trees containing each of those faults, including duplicate
GitHub anchors.

**Baselines** `known-gaps.txt`.

## Tier O — suite health

**Protects** the suite itself: no `.only`, no skip/todo/fixme without a dated quarantine, no test
without an assertion, no `.feature` file that no runner loads, no test file that no Vitest or
Playwright config collects, and no file over its wall-clock budget.

**Lives in** `scripts/checks/suite-health.ts`, `scripts/checks/test-time-budget.ts`,
`tests/suite-health/` (`time-budgets.json`, fixture roots for the runner and feature scans).

```bash
pnpm exec vitest run tests/suite-health
pnpm exec vitest run --retry=0 --reporter=json --outputFile=reports/vitest-nightly.json
pnpm check:test-time reports/vitest-nightly.json
```

Quarantine syntax, checked by regex:

```ts
// quarantine: #123 until 2026-10-01
it.skip("flaky in webkit", () => { ... });
```

A malformed or expired quarantine is a failure. The nightly run uses `--retry=0` because a test
that only passes on retry is a flake, and PR retries hide it.

**Baselines** `known-findings.txt`.

## Contract and API surface

Two different mechanisms, and changing a JSR package's exports means updating **both**.

| Artefact | Generated by | Checked by |
|---|---|---|
| `etc/tutors-model-lib.api.md`, `etc/tutors-gen-lib.api.md`, `etc/tutors-time-lib.api.md` | `pnpm api-report` (`scripts/api-surface.ts`) | `pnpm api-report:check`, a step in the PR `build-and-test` job |
| `tests/contract/__snapshots__/{model,gen,time}-lib-api.test.ts.snap` | `pnpm test:contract -u` | `pnpm test:contract`, also the nightly `contract-snapshots` job |

On 17 September a PR added an export, regenerated the snapshot and not the report; `main` went
red on `api-report:check` until the report was regenerated. If you touch the public surface of
`model`, `gen` or `time`, run both and commit both.

The rest of `tests/contract/` is Zod schemas for the external shapes the apps depend on — six
Supabase tables, two RPCs, the realtime `LoRecord` and whiteboard protocols, and the generated
course JSON — asserting that conforming data is accepted and malformed data rejected.
`tests/mutation/schema-snapshot.test.ts` snapshots the schemas themselves as JSON Schema, so a
renamed column shows up as a snapshot diff rather than a runtime surprise.

## Mutation testing

Stryker over five modules where a flipped comparison silently corrupts a dashboard:
`search.ts`, `lo-utils.ts`, `type-utils.ts`, `base-calendar-model.ts`, `calendar-utils.ts`.
Thresholds: high 85, low 75, break 65.

```bash
pnpm test:mutation            # npx stryker run
```

It runs its own Vitest config (`vitest.config.mutation.ts`) listing the unit and property files
that cover those modules. **No workflow runs it** — it is a local tool for now. Details and how
to read a survivor: [MUTATION-TESTING.md](./MUTATION-TESTING.md).

## BDD and executable specs

Today: `tests/bdd/features/` holds 24 Gherkin feature files with EARS tags, and
`tests/bdd/steps/` holds Vitest suites named after those scenarios, backed by `TestWorld`,
`TestDataFactory` and the mock Supabase/realtime clients in `tests/bdd/support/`.

The honest state is that **no runner loads the feature files**. All 24 are recorded as
`documentation-only` in `tests/suite-health/known-findings.txt`, and the step files are ordinary
Vitest tests, many of which assert against fixtures rather than driving product code. So the
features are specification prose and the steps are unit-ish tests that happen to be named after
them.

Tier D closes that: real executable specs, one runner, features that fail when the product
does. It is tracked in [#214](https://github.com/tutors-sdk/tutors-mono-repo/issues/214), which
also retires the legacy feature files. The tag vocabulary and persona split are worth keeping —
see [EARS-METHODOLOGY.md](./EARS-METHODOLOGY.md) — and until #214 lands, prefer putting new
behaviour in tier B (unit, property) or tier G (journeys), where it actually fails.

## Dev-server smoke tests and the standalone axe audit

Thin Playwright smoke tests live in `apps/<app>/tests/e2e/smoke.spec.ts` with a config per app
(`apps/<app>/playwright.config.ts`), each starting `vite dev` on its own port — reader 5173,
live 5174, catalogue 5175. They check that a page loads, `/auth` responds, an unknown course
renders an error page, and there is at most one `h1`.

```bash
pnpm test:e2e            # reader, then catalogue, then live
pnpm test:e2e:reader --retries=0
```

The root has no Playwright config on purpose: a bare `playwright test` would collect every
Vitest file in the repo, so `pnpm test:e2e` chains the three per-app configs instead. These are
smoke tests, not journeys — the real coverage is tier G against built images. No workflow runs
them: they are a local convenience, and they need the app's own `.env` (copy `.env.example` into
`apps/<app>/`) plus a warm dependency cache, or the first page load fails with Vite's
`504 (Outdated Optimize Dep)`.

`pnpm test:a11y` runs `tests/e2e/accessibility.spec.ts` (axe over a course page via
`playwright-a11y.config.ts`) against `localhost:5173`. It runs in no workflow, and one of its
tests logs violations without asserting — it is baselined as `no-assertion` in tier O. The
enforced accessibility gate is the axe audit inside the tier G journeys.

## Release testing

Push to an `rc/**` branch and two workflows compare the candidate against what is published:
the CLI's output for the reference course, a reader build comparison, benchmarks and smoke tests
against a deployed preview. The scripts are Deno and live in `tests/release/scripts/`.

```bash
deno run -A tests/release/scripts/run-release-tests.ts --mode=all
deno run -A tests/release/scripts/run-release-tests.ts --mode=cli --version=5.0.5
```

Gates, comparators, working directories and the go/no-go rule:
[../tests/release/RELEASE-TESTING.md](../tests/release/RELEASE-TESTING.md). Branch model and
versioning: [Release-Strategy.md](./Release-Strategy.md).

## The release harness

A separate project, outside this repository, stands up the **candidate image** and the
**production tag** side by side and compares them: an A/A run first to measure the noise floor,
then A/B on the same journeys, claims for every intended difference, plus migration, upgrade,
post-deploy and kind-cluster phases and a mutant run to prove the comparison detects planted
faults. It reuses this repo's course arbitrary and can point the tier G journeys at a second
stack by changing the URLs.

It is not wired into this repository yet: nothing here publishes an image for it to fetch and no
workflow dispatches it. Treat its findings as pre-release evidence recorded by hand until that
lands.

## Planned tiers

| Tier | Would own | Tracked by |
|---|---|---|
| D | Executable EARS/Gherkin specs | [#214](https://github.com/tutors-sdk/tutors-mono-repo/issues/214) |
| F | The authorisation matrix — every route against every role | RBAC [#77](https://github.com/tutors-sdk/tutors-mono-repo/issues/77); `/api/sync` auth is the open decision. See [RBAC.md](./RBAC.md) |
| H | Message contracts for the realtime and broadcast protocols, versioned | No issue yet; shapes are snapshot-checked in `tests/contract/` |
| I | Data migration and the Supabase exit | No issue yet |

Do not claim these in documentation or PR descriptions until the suite and its negative fixture
exist.

## CI schedule

### `ci.yml` — push to `main`, and every PR to `main`

| Job | What it does |
|---|---|
| `build-and-test` | Install, copy `.env.example` into the four apps, `svelte-kit sync`, `pnpm build`, `pnpm api-report:check`, three `check` steps (`continue-on-error`, [#53](https://github.com/tutors-sdk/tutors-mono-repo/issues/53)), `pnpm lint`, `pnpm check:knip`, `vitest run --coverage`, `pnpm test:fuzz` |
| `platform-conformance` | `pnpm check:k8s --out rendered`, kubeconform against the rendered manifests, and kubeconform must reject the invalid-manifest fixture |
| `container-smoke` | Matrix over reader, catalogue, live, time: build the image, `pnpm check:container --image … --app …` |
| `container-smoke-fixtures` | The faulty-image fixture: healthy passes; `readonly`, `uid` and a headerless app all fail as expected |
| `dependency-audit` | `pnpm check:audit --base-dir base` on PRs (only new advisories), `pnpm check:audit` on `main` |
| `e2e-stack` | Build reader, catalogue and live images, build the fixture course, bring the stack up, run the journeys on chromium and webkit, then the baseline stale-line check; uploads the report and compose logs on failure |
| `bundle-budgets` | Build all four apps with `SVELTEKIT_ADAPTER=node`, then `pnpm check:bundle` |
| `generator-diff` | Only when the PR touches `packages/jsr/{gen,tutors,tutors-lite,model}`, `deno.json(.lock)`, `tests/generator/` or `scripts/checks/generator-*`: the planted-change self-test, then every difference must be claimed |
| `CI success` | Needs all eight; a skipped or cancelled job counts as a failure. The one required check |

`codeql.yml` and `zizmor.yml` also run on every PR (CodeQL for JavaScript/TypeScript, zizmor over
the workflows). `scorecard.yml` runs weekly and on pushes to `main`.

### `nightly.yml` — 03:00 UTC, or `workflow_dispatch`

| Job | What it does |
|---|---|
| `contract-snapshots` | `pnpm test:contract` |
| `suite-health` | `vitest run --retry=0` with a JSON report, then `pnpm check:test-time` on it |
| `e2e-stack-nightly` | The tier G journeys on firefox and mobile, then the baseline stale-line check |
| `timezone-matrix` | `pnpm test:tz` |
| `lighthouse` | Build the reader image and the fixture course, serve the course, run Lighthouse against three pages and record the samples |
| `load` | Prove the thresholds bite (`P95_MS=0 --expect-fail`), three 3-minute load runs recorded for baselining, then a 45-minute soak |
| `generator-corpus` | Regenerate the pinned public courses at upstream HEAD and diff against last night's cached snapshot |
| `report` | Writes the job table into the run summary and fails if any job failed |

### `rc-validation.yml` — push to `rc/**`

Gate 1 lint and type check, 2a unit and BDD with a coverage upload, 2b contract, 2c fuzz at
`FUZZ_RUNS=1000`, 2d the Deno tests in `packages/jsr/gen`, 3a build verification, 3b dependency
audit, 4 cross-browser E2E for the reader, 6 artifact regression, then an `RC Readiness Report`
that fails if any gate failed.

This workflow has not kept pace with the runway and two of its gates cannot pass as written:
Gate 1 runs the broken root `pnpm check`, and Gate 4 runs `pnpm --filter tutors-reader test:e2e`,
a script the apps do not define. It also duplicates work `ci.yml` now does better. Reconciling it
is open work; do not read it as the authority on what a release is checked against.

### `release-testing.yml` — push to `rc/**`, or `workflow_dispatch` with a baseline version

Gate 6a artifact regression, 6b performance benchmark, 6c smoke tests against the deployed
preview, then a report that blocks on 6a and 6c and warns on 6b.

## Debugging

```bash
# One file, one test
pnpm exec vitest run tests/unit/time/calendar-utils.test.ts
pnpm exec vitest run -t "pivots rows by student"

# Why is this test not running anywhere?
pnpm exec vitest run tests/suite-health          # tier O names uncollected files

# A ratchet failed: which line?
pnpm exec vitest run tests/architecture          # prints added and stale baseline lines
pnpm architecture-report                         # full violation list with paths

# A property failed
FUZZ_SEED=<seed> FUZZ_PATH=<path> pnpm test:fuzz

# A timezone-only failure
pnpm test:tz -- tests/unit/time

# A journey failed in CI
pnpm e2e:stack:fixture && pnpm e2e:stack:up
pnpm test:e2e:stack --project=chromium --debug
docker compose -f tests/e2e-stack/compose.yaml logs --no-color
pnpm exec playwright show-report playwright-report/e2e-stack
pnpm e2e:stack:down

# The image, not the app
pnpm check:container --image tutors/reader:local --app reader

# The public surface changed
pnpm api-report && pnpm test:contract -u        # commit both

# Coverage
pnpm test:coverage && open coverage/index.html
```

Playwright artefacts land in `playwright-report/e2e-stack` and `test-results/e2e-stack` for tier
G, and in `apps/<app>/playwright-report/` for the smoke configs. CI uploads both on failure.

## Known gaps

- Type errors are not a blocker yet ([#53](https://github.com/tutors-sdk/tutors-mono-repo/issues/53), [#235](https://github.com/tutors-sdk/tutors-mono-repo/issues/235)).
- Coverage thresholds sit at 55/50/65/55 and should ratchet upward.
- `tests/components/` tests props, variants and state transitions as plain data; nothing renders
  a Svelte component, and `@testing-library/svelte` is an unused dependency.
- `tests/bdd/features/` is documentation only ([#214](https://github.com/tutors-sdk/tutors-mono-repo/issues/214)).
- Mutation testing runs nowhere in CI.
- `rc-validation.yml` and the root `pnpm check` script need the fixes described above.
- Tiers D, F, H and I are not built.
