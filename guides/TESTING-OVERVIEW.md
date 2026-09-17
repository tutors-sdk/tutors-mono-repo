# Testing Overview

What each tier owns, how to run it, and what blocks a release. The long form is
[TESTING.md](./TESTING.md). The map from `tests/<dir>` to tier and runner is
[../tests/TESTING.md](../tests/TESTING.md).

Two rules hold everywhere:

- **One owning tier per failure class.** If no tier owns a class of bug, it ships.
- **No tier without a negative fixture.** A check nobody has watched fail is not a check.

## Tiers

Letters follow the Testing Runway. "In repo" means both the tests and the CI job exist
today. There are no git hooks in this repository, so nothing runs at commit time; the
first gate is the pull request.

| Tier | Failure class it owns | Status | Where it runs |
|---|---|---|---|
| **A** | Structure — layer violations, package cycles, app-to-app imports, JSR/Node manifest drift, unused files, exports and dependencies | In repo | PR: `build-and-test` (`pnpm check:knip`, then `vitest`) |
| **B** | Logic — unit behaviour of the JSR and Svelte packages, invariants over any course or calendar, timezone dependence | In repo | PR: `build-and-test` (`vitest run --coverage`, `pnpm test:fuzz`). Nightly: `timezone-matrix` |
| **C** | Generated output — an unintended change in the course JSON, zip or site a generator produces | In repo | PR: `generator-diff`, only when the PR touches a generator. Nightly: `generator-corpus` |
| **D** | Requirements — executable EARS/Gherkin specs | Planned ([#214](https://github.com/tutors-sdk/tutors-mono-repo/issues/214)) | Feature files are documentation only today |
| **F** | Authorisation — who may call what | Planned ([#77](https://github.com/tutors-sdk/tutors-mono-repo/issues/77)) | — |
| **G** | User journeys — the whole system through a real browser, against built images | In repo | PR: `e2e-stack` (chromium, webkit). Nightly: `e2e-stack-nightly` (firefox, mobile) |
| **H** | Message contracts — the realtime and broadcast protocols as a versioned contract | Planned, no issue yet | Shapes are snapshot-checked under tier "contract" below |
| **I** | Data — migration and the Supabase exit | Planned, no issue yet | — |
| **J** | Platform — kustomize overlays, restricted-SCC policy, arbitrary UID, read-only root, env-var completeness | In repo | PR: `platform-conformance`, `container-smoke`, `container-smoke-fixtures`, and `vitest` |
| **K** | Observability — log schema, request-id correlation, hook order, metrics an alert queries | In repo | PR: `build-and-test` (`vitest`) and `container-smoke` |
| **L** | Performance and capacity — client bundle ceilings, Lighthouse floors, latency, memory growth | In repo | PR: `bundle-budgets`. Nightly: `lighthouse`, `load` |
| **M** | Security — response headers, cookie flags, CSRF, the mutating-route inventory, dependency advisories | In repo | PR: `dependency-audit`, `container-smoke` (`--app`), and `vitest` |
| **N** | Completeness — translations, theme tokens, icon libraries, dead links and anchors in tracked Markdown, app READMEs | In repo | PR: `build-and-test` (`vitest`) |
| **O** | Suite health — `.only`, undated skips, assertionless tests, files no runner collects, per-file time budgets | In repo | PR: `build-and-test` (`vitest`). Nightly: `suite-health` (no retries, budgets) |

The letters skip E: nothing in this repository claims it.

Three tiers predate the runway letters and still carry weight:

| Tier | Owns | Where it runs |
|---|---|---|
| Contract / API surface | Public exports of the three JSR packages, Supabase row and RPC shapes, realtime message shapes, generated course JSON | PR: `pnpm api-report:check` in `build-and-test`. Nightly: `contract-snapshots`. RC: Gate 2b |
| Mutation | Whether the unit assertions actually detect a change in the analytics and search code | Local only — `pnpm test:mutation`. No workflow runs it |
| Release artifact | The CLI's output for the reference course against the last published CLI | Push to `rc/**`: `rc-validation.yml` Gate 6, `release-testing.yml` Gates 6a–6c |

## Commands

Every command below exists in the root `package.json`.

| Command | What it runs |
|---|---|
| `pnpm lint` | ESLint over the repo |
| `pnpm test` | `vitest run` — everything under `tests/` except `e2e`, `e2e-stack`, `release` and `fuzz` |
| `pnpm test:coverage` | The same run with v8 coverage against the thresholds in `vitest.config.ts` |
| `pnpm test:bdd` | The step files under `tests/bdd/` |
| `pnpm test:contract` | `tests/contract/` — API surface snapshots and Zod shape checks |
| `pnpm test:fuzz` | The property suites, on the threads pool (`vitest.config.fuzz.ts`) |
| `pnpm test:tz` | Unit and property suites under UTC, Europe/Dublin and Pacific/Auckland |
| `pnpm test:runway` | The repo-level suites: architecture, suite-health, completeness, observability, conformance, security, performance |
| `pnpm test:mutation` | Stryker over the five targeted modules |
| `pnpm test:e2e` | The three per-app Playwright smoke configs in sequence, each against `vite dev`. Local only — no workflow runs them |
| `pnpm test:e2e:reader` / `:catalogue` / `:live` | One app's smoke config |
| `pnpm e2e:stack:fixture` | Builds the fixture course (needs Deno) |
| `pnpm e2e:stack:up` / `:down` | The tier G compose stack |
| `pnpm test:e2e:stack` | The journeys against the running stack |
| `pnpm test:e2e:stack:ratchet` | Fails on stale lines in the journey baselines |
| `pnpm test:a11y` | `tests/e2e/accessibility.spec.ts` against `localhost:5173` |
| `pnpm api-report` / `api-report:check` | Regenerate / verify `etc/*.api.md` |
| `pnpm architecture-report` | Every dependency-cruiser violation, baselined ones included |
| `pnpm check:knip` | Unused files, exports and dependencies |
| `pnpm check:audit` | `pnpm audit` against `tests/security/audit-allowlist.json` |
| `pnpm check:bundle` | Per-app client bundle ceilings |
| `pnpm check:lighthouse` | Lighthouse floors on three reader pages |
| `pnpm check:load` | k6 load or soak against a built image |
| `pnpm check:k8s` | Render every overlay and apply the manifest policies |
| `pnpm check:container` | Smoke a built image: UID, read-only root, healthz, metrics, logs, headers |
| `pnpm check:test-time` | Per-file time budgets from a Vitest JSON report |
| `pnpm check:generator-diff` | Generator differential against a base ref, or the nightly corpus |
| `pnpm check:all` | `check`, `test`, `test:contract`, `build` — currently fails at the first step, because the root `check` script is broken (see the long form) |

Before opening a PR the expected local run is `pnpm lint` and `pnpm test`; see
[../CONTRIBUTING.md](../CONTRIBUTING.md).

## Where does my new test go

| What you are protecting | Put it in | Tier |
|---|---|---|
| A pure function in a JSR or Svelte package | `tests/unit/<area>/` | B |
| A property that must hold for any course or calendar | `tests/fuzz/`, with the arbitrary in `tests/support/arbitraries/` | B |
| A Supabase row, RPC or realtime message shape | `tests/contract/` | Contract |
| A public export of a JSR package | `pnpm api-report`, then update the contract snapshot | Contract |
| Something a user does in a browser | `tests/e2e-stack/journeys/` | G |
| A difference in generated course output | `tests/generator/corpus/`, claimed in `tests/generator/claims.yaml` | C |
| A rule about the repository — config, manifests, docs, logs, headers | A pure function in `scripts/checks/`, a suite in `tests/<area>/` with negative fixtures | A, J, K, M, N, O |
| A ceiling or floor — bundle size, Lighthouse, latency | The JSON beside the suite in `tests/performance/` | L |
| Props, state or variant logic for a component | `tests/components/` — these are logic tests, not renders | — |

New repo-level checks are written as a pure function plus a suite that runs it against a
deliberately broken fixture first, then against the real repo.

## Ratchets, baselines and quarantine

Checks that found problems on day one hold them in a baseline text file beside the suite.
The rule is the same for all of them:

- A problem that is not in the baseline fails the build.
- A baseline line that no longer occurs also fails the build.
- Fixing something therefore means deleting its line. Baselines may only shrink.

| Baseline | Holds |
|---|---|
| `tests/architecture/known-violations.txt` | Dependency-cruiser violations |
| `tests/architecture/known-manifest-drift.txt` | `deno.json` vs `package.json` drift |
| `tests/architecture/known-knip.txt` | Unused files, exports and dependencies |
| `tests/completeness/known-gaps.txt` | Translations, themes, icons, docs, READMEs |
| `tests/suite-health/known-findings.txt` | Skips, assertionless tests, uncollected files |
| `tests/security/known-response-gaps.txt` | Missing headers and 5xx answers per app |
| `tests/fuzz/known-timezone-failures.txt` | Tests that fail outside UTC |
| `tests/e2e-stack/a11y-known-violations.txt` | Serious and critical axe findings per page |
| `tests/e2e-stack/reduced-motion-known.txt` | Elements that still animate under reduced motion |

A test may be skipped without a baseline entry if the line above it names an issue and an
expiry date. After that date the skip fails again:

```ts
// quarantine: #123 until 2026-10-01
it.skip("flaky in webkit", () => { ... });
```

## The gate

`ci.yml` ends in one job, **`CI success`**, which needs `build-and-test`,
`platform-conformance`, `container-smoke`, `container-smoke-fixtures`, `dependency-audit`,
`e2e-stack`, `bundle-budgets` and `generator-diff`. It treats a skipped or cancelled job
as a failure. It is the one check to mark as required in branch protection, so adding a job
to its `needs` extends the gate without touching repository settings. Whether it is currently
marked required is a setting, not something this repository can show you.

## What blocks a release

Only what CI enforces today.

| Stage | Blocks on |
|---|---|
| PR to `main` | `CI success`. That includes coverage below the thresholds in `vitest.config.ts` (statements 55, branches 50, functions 65, lines 55), a new baseline entry, a stale baseline line, an unclaimed generator difference, a bundle over its ceiling, a new dependency advisory the PR introduces, and a failed journey |
| Push to `rc/**` | `rc-validation.yml` — its `RC Readiness Report` fails if any gate failed — and `release-testing.yml`, whose report blocks on artifact regression and smoke tests and only warns on the performance benchmark |
| Nightly | Nothing. A red nightly is a bug to chase, not a merge block |

Type checking is **not** a blocker: the three `check` steps in `build-and-test` carry
`continue-on-error: true` while the pre-existing errors in
[#53](https://github.com/tutors-sdk/tutors-mono-repo/issues/53) and
[#235](https://github.com/tutors-sdk/tutors-mono-repo/issues/235) are worked through.
