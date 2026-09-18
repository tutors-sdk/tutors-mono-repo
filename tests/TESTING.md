# The `tests/` directory

A map from each directory to its tier, runner and command. Why each tier exists, how it proves
it can fail and when CI runs it are in the long form,
[../guides/TESTING.md](../guides/TESTING.md); the one-page summary is
[../guides/TESTING-OVERVIEW.md](../guides/TESTING-OVERVIEW.md).

## The map

| Directory | Tier | Runner / config | Command |
|---|---|---|---|
| `unit/` | B | Vitest, `vitest.config.ts` | `pnpm exec vitest run tests/unit` |
| `fuzz/` | B | Vitest, `vitest.config.fuzz.ts` (threads pool) | `pnpm test:fuzz` |
| `generator/` | C | Vitest + Deno generator | `pnpm exec vitest run tests/generator`, `pnpm check:generator-diff` |
| `bdd/` | D | Vitest collects `steps/**/*.steps.ts`, each of which loads its `features/**` file through `vitest-cucumber` | `pnpm test:bdd` |
| `components/` | — | Vitest, no DOM environment | `pnpm exec vitest run tests/components` |
| `contract/` | Contract | Vitest, with `__snapshots__/` | `pnpm test:contract` |
| `e2e-stack/` | G | Playwright, `playwright.e2e-stack.config.ts` | `pnpm test:e2e:stack` |
| `e2e/` | — | Playwright, `playwright-a11y.config.ts` | `pnpm test:a11y` |
| `conformance/` | J | Vitest + `pnpm check:k8s`, `pnpm check:container` | `pnpm exec vitest run tests/conformance` |
| `observability/` | K | Vitest | `pnpm exec vitest run tests/observability` |
| `performance/` | L | Vitest + `check:bundle`, `check:load`, `check:lighthouse` | `pnpm exec vitest run tests/performance` |
| `security/` | M | Vitest + `pnpm check:audit`, `check:container --app` | `pnpm exec vitest run tests/security` |
| `completeness/` | N | Vitest | `pnpm exec vitest run tests/completeness` |
| `architecture/` | A | Vitest + `pnpm check:knip` | `pnpm exec vitest run tests/architecture` |
| `suite-health/` | O | Vitest + `pnpm check:test-time` | `pnpm exec vitest run tests/suite-health` |
| `mutation/` | Mutation / schema | Stryker (`stryker.config.json`, `vitest.config.mutation.ts`); `schema-snapshot.test.ts` runs under Vitest | `pnpm test:mutation` |
| `release/` | Release | Deno scripts | `deno run -A tests/release/scripts/run-release-tests.ts --mode=all` |
| `support/` | — | Shared setup, stubs and arbitraries; not a suite | — |

`pnpm test` is `vitest run`, which collects `tests/**/*.test.ts` and `tests/**/*.steps.ts` and
excludes `node_modules`, `tests/e2e/`, `tests/release/` and `tests/fuzz/`. Anything named
`*.spec.ts` is therefore Playwright's, never Vitest's. `pnpm test:runway` is a shortcut for the
seven repo-level directories: `architecture`, `suite-health`, `completeness`, `observability`,
`conformance`, `security`, `performance`.

## Notes per directory

### `unit/` (tier B)

62 files grouped by the package under test — `model`, `time`, `gen`, `connect`, `community`,
`rbac`, `themes`, `utils`, `reader`, `apps`. Pure functions, no DOM, no network. The JSR
packages hold the computation that matters: calendar pivoting, medians, search indexing,
learning-object tree traversal.

### `fuzz/` (tier B)

Property-based tests with `fast-check`, against the real package code and never a copy. Courses
come from the shared arbitrary in `support/arbitraries/course-tree.ts` — generator-shaped JSON
with `{{COURSEURL}}` routes, nested composites, lab steps, Unicode and hidden learning objects —
which the generator differential and the release harness reuse. Each property is a factory over
the implementation it checks, and a negative fixture runs it against a deliberately broken
wrapper to prove it can fail.

A dedicated config exists because fast-check v4 property generation crashes Vitest's default
fork workers ([#8](https://github.com/tutors-sdk/tutors-mono-repo/issues/8)).

- **Replay**: a failure prints `{ seed, path }`; rerun with `FUZZ_SEED=<seed> FUZZ_PATH=<path> pnpm test:fuzz`. `FUZZ_RUNS` raises the run count (RC validation uses 1000).
- **Timezones**: `pnpm test:tz` runs the unit and property suites under UTC, Europe/Dublin and Pacific/Auckland and ratchets failures against `fuzz/known-timezone-failures.txt`. Set the zone through the script, not `TZ=... pnpm test` in Git Bash, which does not pass `TZ` to Node on Windows; the suite asserts the zone really applied.
- **No network**: `support/no-network.ts` is a setup file for the root and fuzz configs. `fetch`, `http(s)`, `net` and `tls` connections to anything but loopback throw unless the file is allow-listed there with a reason or the test calls `allowNetwork("reason")`.

### `generator/` (tier C)

`corpus/synthetic-course/` is the committed course the differential runs over: typical topics,
panels, media, empty and hidden units, Unicode filenames. `corpus.yaml` pins the public courses
the nightly regenerates at upstream HEAD. `claims.yaml` holds a claim for every intended
difference — an unclaimed hunk fails the PR job, and a claim broad enough to hide unrelated
change needs the `approve-broad-claim` label. `pnpm check:generator-diff --plant` is the
self-test that a one-character template change is caught.

### `bdd/` (tier D)

`features/` holds 20 Gherkin files, 73 scenarios, with EARS tags across the student,
instructor, developer and shared personas. Every one is executable: its file under `steps/`
loads it with `loadFeature("tests/bdd/features/…")` and binds each scenario with
[`vitest-cucumber`](https://vitest-cucumber.miceli.click/), so the run fails when a scenario
or a step exists in the feature and not in the steps, or the other way round.

Steps call product code — the model and time libraries, the course, theme, i18n, connect,
presence and catalogue services — and assert on what it returns, writes or broadcasts. The
stand-ins are at the edges only: `support/supabase-recorder.ts` for Supabase and realtime,
`support/runes-stub.ts` and `support/svelte-runes-shim.ts` for `$state` (the root config has no
Svelte compiler), and a stand-in `fetch` for the course host. `support/course.ts` publishes a
course as the generator would and loads it through the real `decorateCourseTree`.

Scenarios that need a browser, or describe behaviour the product does not have, are prose in
[../guides/specifications/](../guides/specifications/README.md), each with the tier that covers
it or a plain "nothing does". [#214](https://github.com/tutors-sdk/tutors-mono-repo/issues/214)
still owns the rest of the EARS plan: `Rule:` blocks and the structural audit. How to write and
bind a scenario: [../guides/EARS-METHODOLOGY.md](../guides/EARS-METHODOLOGY.md).

### `components/`

Despite the name, nothing renders a Svelte component: the root Vitest config runs in Node with
no DOM environment, and `@testing-library/svelte` is an unused dependency. These files model
props, variants, state transitions and store logic as plain data. Rendering, events, focus and
ARIA are covered by the axe audits inside the tier G journeys.

### `contract/`

Two mechanisms:

- `model-lib-api.test.ts`, `gen-lib-api.test.ts`, `time-lib-api.test.ts` snapshot the export names of the three JSR packages into `__snapshots__/`. These are **separate** from the human-readable reports in `etc/*.api.md` generated by `pnpm api-report`. Changing a package's exports means regenerating both, in the same commit.
- Zod schemas in `support/schemas.ts` describe the external shapes — six Supabase tables, two RPCs, the realtime `LoRecord` and whiteboard protocols and the generated course JSON — and the suites assert that conforming data is accepted and malformed data rejected. `support/schema-generators.ts` turns those schemas into fast-check arbitraries, and `bdd/support/schema-validated-fixtures.ts` parses fixtures through them so they cannot drift.

### `e2e-stack/` (tier G)

Named journeys against the **built container images** with a fixture course server, so GitHub
and Netlify are not dependencies. Compose services, fixture course, port and URL overrides and
the file-by-file map: [e2e-stack/README.md](./e2e-stack/README.md).

```bash
pnpm e2e:stack:fixture     # needs Deno
pnpm e2e:stack:up
pnpm test:e2e:stack --project=chromium --project=webkit
pnpm test:e2e:stack:ratchet
pnpm e2e:stack:down
```

No retries: a journey that needs one is a finding. `journeys/negative.journey.spec.ts` holds
`test.fail()` journeys that prove a journey can fail and pin known product bugs.

### `e2e/`

One standalone axe audit (`accessibility.spec.ts`) over a course page, run by `pnpm test:a11y`
against `localhost:5173`. It runs in no workflow, and one of its tests logs violations without
asserting — baselined as `no-assertion` in tier O. The per-app Playwright smoke tests live
outside this directory, in `apps/<app>/tests/e2e/smoke.spec.ts`, and run with
`pnpm test:e2e:reader`, `:catalogue`, `:live` (or all three via `pnpm test:e2e`) against
`vite dev`.

### The repo-level suites (tiers A, J, K, M, N, O and L)

Checks over the repository itself rather than over one module. The logic lives in
`scripts/checks/` as pure functions; each suite runs it against **negative fixtures** that prove
it can fail, then against the real repo.

| Tier | Directory | What fails the build |
|---|---|---|
| A | `architecture/` | An import that goes up a layer, an app importing another app, a relative import into another workspace, a cycle across packages (`.dependency-cruiser.cjs`); `deno.json` and `package.json` disagreeing on name, version, exports or dependency majors; new unused files, exports or dependencies (`pnpm check:knip`, config in `knip.json`) |
| J | `conformance/` | An env var the code reads that is missing from `.env.example` or the kustomize manifests; a workload that breaks the restricted-SCC policies; an overlay image tag that is not the `package.json` version |
| K | `observability/` | A log line outside the schema; a failed request whose lines lack its request id, or with other than one error line carrying a stack; an app whose hooks do not put the request logger first; a Grafana alert querying a series `/metrics` does not export |
| L | `performance/` | A client bundle over its ceiling (`bundle-budgets.json`), a Lighthouse median below its floor (`lighthouse.json`), a k6 threshold crossed, memory growing after warm-up, a soak whose late p95 doubled. See [performance/README.md](./performance/README.md) |
| M | `security/` | A `svelte.config.js` that turns off SvelteKit's cross-site form check; a `POST`/`PUT`/`PATCH`/`DELETE` endpoint or form action missing from `mutating-routes.txt`, or listed without who may call it; a malformed audit allowance. Against the image: a response missing a header from `header-contract.json` or answering 5xx on a probed path, a cookie without `HttpOnly`/`SameSite`/`Secure`, a mutating route that accepts a cross-site form post |
| N | `completeness/` | A missing, orphan or blank translation, or an unknown `t("key")`; a theme missing a base token, or offered but not loaded; an icon library missing an icon; a dead relative link or anchor in tracked Markdown; an app README out of step with its `@tutors/*` dependencies |
| O | `suite-health/` | `.only`; a skip, todo or fixme without a dated quarantine; a test with no assertion; a `.feature` file that no steps file binds and no cucumber config loads, or one with an EARS keyword Gherkin drops (`While`, `Where`, `If`) or an `@ignore` tag; a test file no Vitest or Playwright config, and no `deno test` workflow step, collects. Nightly: a no-retry run, and a test file over its budget in `time-budgets.json` |

### `mutation/`

`schema-snapshot.test.ts` is a Vitest suite: it snapshots the contract Zod schemas as JSON
Schema, so a renamed Supabase column fails here rather than in production. Stryker itself is
configured at the repo root (`stryker.config.json`, `vitest.config.mutation.ts`) over five
modules, thresholds high 85 / low 75 / break 65, and runs only locally via `pnpm test:mutation`
— no workflow runs it. See [../guides/MUTATION-TESTING.md](../guides/MUTATION-TESTING.md).

### `release/`

Deno scripts that compare the candidate CLI's output for the reference course against the last
published CLI, compare reader builds, benchmark and smoke-test a deployed preview, with the
comparators in `comparators/`. They run on pushes to `rc/**`. Gates and the go/no-go rule:
[release/RELEASE-TESTING.md](./release/RELEASE-TESTING.md).

### `support/`

Not a suite. `no-network.ts` (setup file for the root and fuzz configs),
`arbitraries/course-tree.ts` (the shared course arbitrary), `sveltekit-stubs.ts`,
`vento-stub.ts`, `archiver-shim.ts`.

## Ratchets and quarantine

Checks that found problems on day one hold them in a baseline text file beside the suite:
`architecture/known-violations.txt`, `architecture/known-manifest-drift.txt`,
`architecture/known-knip.txt`, `completeness/known-gaps.txt`, `suite-health/known-findings.txt`,
`security/known-response-gaps.txt`, `fuzz/known-timezone-failures.txt`,
`e2e-stack/a11y-known-violations.txt`, `e2e-stack/reduced-motion-known.txt`.

A new problem fails. So does a baseline line that no longer occurs, so fixing something means
deleting its line, and a baseline can only shrink.

A test may be skipped without a baseline entry if the line above names an issue and an expiry.
After that date it fails again:

```ts
// quarantine: #123 until 2026-10-01
it.skip("flaky in webkit", () => { ... });
```

## Checks that need Docker or kustomize

These run as their own CI jobs rather than under Vitest:

```bash
pnpm check:k8s                                     # render every overlay and apply the manifest policies
pnpm check:k8s --out rendered                      # also write the output for kubeconform
docker build --build-arg APP_NAME=reader -t tutors/reader:local .
pnpm check:container --image tutors/reader:local   # random UID, read-only root, .env.example only: healthz, metrics, log contract
pnpm check:container --image tutors/reader:local --app reader   # plus tier M: headers, cookies, CSRF
pnpm check:audit                                   # pnpm audit against security/audit-allowlist.json
pnpm check:audit --base-dir base                   # PR mode: only advisories absent from base/pnpm-lock.yaml fail
pnpm check:bundle                                  # after building the apps with SVELTEKIT_ADAPTER=node
pnpm check:load --image tutors/reader:ci --rate 50 --duration 3m --runs 3
pnpm check:lighthouse --image tutors/reader:ci
pnpm architecture-report                           # every dependency-cruiser violation, known ones included
```

The container check proves it can fail against `conformance/fixtures/faulty-image`
(`FIXTURE_FAULT=readonly` or `uid`); CI runs kubeconform against
`conformance/fixtures/invalid-manifest.yaml` for the same reason.

## File naming

| Pattern | Collected by | Example |
|---|---|---|
| `*.test.ts` | Vitest (root config) | `unit/time/calendar-utils.test.ts` |
| `*.steps.ts` | Vitest (root config) | `bdd/steps/student/course-discovery.steps.ts` |
| `*.contract.test.ts` | Vitest, under `contract/` | `contract/supabase/calendar.contract.test.ts` |
| `*.fuzz.test.ts` | Vitest (fuzz config only) | `fuzz/course-model.fuzz.test.ts` |
| `*.journey.spec.ts` | Playwright (`playwright.e2e-stack.config.ts`) | `e2e-stack/journeys/student.journey.spec.ts` |
| `*.spec.ts` | Playwright only, never Vitest | `e2e/accessibility.spec.ts` |
| `*.feature` | Vitest, through the steps file that loads it (tier D) | `bdd/features/student/lab-interaction.feature` |

A new test file that no config collects fails tier O, so add the file to a directory an existing
config already covers, or extend the config in the same commit.
