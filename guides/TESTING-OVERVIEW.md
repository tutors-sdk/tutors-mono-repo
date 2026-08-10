# Testing Overview

A quick-reference companion to the full [Testing Guide](./TESTING.md). This document answers three questions: what do we test, how do I run it, and what blocks a release.

## At a Glance

| Tier | Name | Status | Runs On |
|---|---|---|---|
| 1 | TDD (unit) | Partial (course, gen) | Every push |
| 2 | BDD (behavioral) | Scaffolded | Every push |
| 3 | Component (browser) | Scaffolded | Every push |
| 4 | Integration (mocked) | Scaffolded | Every push |
| 5 | E2E (Playwright) | Configured | PR / nightly |
| 6 | Contract (API surface) | Scaffolded | PR / RC |
| 7 | Fuzz (fast-check) | Active (`pnpm test:fuzz`) | PR / RC |

Fuzz runs via a dedicated Vitest config with the threads pool ([#8](https://github.com/tutors-sdk/tutors-mono-repo/issues/8)); it is not part of default `pnpm test`.

Additionally, **Gate 6: Release Artifact Testing** compares CLI output against production using the [tutors-reference-course](https://github.com/tutors-sdk/tutors-reference-course). This runs on RC branches and can be triggered manually.

## Quick Reference

### Running Tests

| Command | What It Runs | When To Use |
|---|---|---|
| `pnpm test` | Unit + BDD (Tiers 1-2) via Turborepo | During development |
| `pnpm test:bdd` | Root-level BDD step definitions | After changing feature behaviour |
| `pnpm test:contract` | API surface snapshot tests | After modifying package exports |
| `pnpm test:fuzz` | Property-based fuzz tests (threads pool) | After changing data models/transforms |
| `pnpm test:e2e` | Playwright E2E tests | Before submitting a PR |
| `pnpm test:components` | Svelte component tests | After UI changes |
| `pnpm test:cli` | Deno CLI tests | After changing CLI code |
| `pnpm test:release` | Artifact regression (baseline vs candidate) | Before cutting an RC |
| `pnpm test:release:smoke` | Production smoke tests via Playwright | After deploying |
| `pnpm test:release:bench` | Performance benchmarks (CLI, build, bundle) | Before cutting an RC |
| `pnpm check:all` | Full validation pipeline | Before cutting an RC |

### Filtering

```bash
pnpm --filter tutors-reader test              # Test only the reader app
pnpm --filter @tutors/course test             # Test only a single package
pnpm vitest run tests/fuzz/calendar-model.fuzz.test.ts  # Single file
```

## Testing Philosophy

### BDD First

Every significant user-facing behaviour starts as a Gherkin feature file before implementation begins. Feature files serve as the specification — readable by non-developers, versioned with the code, and executable as tests. This is the primary testing paradigm, adapted from [ESI.ts](https://github.com/lgriffin/ESI.ts/blob/master/guides/TESTING.md).

### Why Seven Tiers

Each tier catches a different class of defect:

| Tier | What It Catches |
|---|---|
| **TDD** | Implementation bugs — wrong logic, off-by-one, null handling |
| **BDD** | Behaviour regressions — the user expected X but got Y |
| **Component** | Rendering bugs — reactive state, DOM events, CSS (real browser) |
| **Integration** | Wiring bugs — data doesn't flow correctly between packages |
| **E2E** | System bugs — routing, SSR, auth flows, real browser interactions |
| **Contract** | Semver violations — accidental removal/rename of public API exports |
| **Fuzz** | Edge cases — random inputs finding failures humans wouldn't write tests for |

### TDD + BDD Coexistence

TDD covers the **how** (internal functions, edge cases, error paths). BDD verifies the **what** (user-facing behaviours in Gherkin). The overlap is intentional.

## Coverage Requirements

| Metric | Threshold | Target |
|---|---|---:|
| Statements | 90% | 95% |
| Branches | 80% | 85% |
| Functions | 75% | 90% |
| Lines | 90% | 95% |

Coverage is enforced per-package via Vitest config. CI hard-fails if any package drops below thresholds.

## CI Pipeline Summary

### What Runs When

| Trigger | Workflow | Tests Run |
|---|---|---|
| Every push/PR | `ci.yml` | Lint, typecheck, unit + BDD, fuzz, E2E (Chromium), CLI |
| Daily 3 AM UTC | `nightly.yml` | Full E2E (all browsers), contract validation |
| Push to `rc/**` | `rc-validation.yml` | All gates (9 jobs) — full test matrix |
| Push to `rc/**` | `release-testing.yml` | Artifact regression, performance, smoke tests |

### Gate Summary (RC Validation)

| Gate | Job(s) | Pass Criteria |
|---|---|---|
| 1 | Lint & Type Check | Zero ESLint errors, zero TypeScript errors |
| 2a | Unit & BDD | All tests pass, coverage above thresholds |
| 2b | Contract | API snapshots match (or intentionally updated) |
| 2c | Fuzz (Extended) | 1000-run fuzz with zero failures (`FUZZ_RUNS=1000 pnpm test:fuzz`) |
| 2d | CLI | All Deno tests pass |
| 3a | Build Verification | All apps produce `.svelte-kit/` output |
| 3b | Dependency Audit | Zero critical CVEs |
| 4 | Cross-Browser E2E | Pass on Chromium, Firefox, and WebKit |
| 6 | Artifact Regression | CLI output matches production for reference course |

## What Blocks a Release

Every condition below is a **hard-fail** — the RC cannot merge to main until resolved.

| Condition | Gate |
|---|---|
| Any test tier fails | 2 |
| Coverage below thresholds | 2 |
| Contract snapshot mismatch (unintentional) | 2b |
| Fuzz failure at 1000 runs | 2c |
| Production build fails | 3a |
| Critical CVE in dependencies | 3b |
| Cross-browser E2E failure | 4 |
| Artifact regression — missing LOs or changed routes | 6 |

**Soft-fail conditions** (warning, does not block):

| Condition | Required Action |
|---|---|
| Bundle size increase 5-10% | Justify in PR description |
| New BDD feature files without step definitions | Track in issue |
| Moderate CVEs in dependencies | File issue for next sprint |

## Adding Tests

1. **Start with BDD** — Write the Gherkin feature file first. Place in `tests/bdd/features/<domain>/`.
2. **Write step definitions** — Create `*.steps.ts` in `tests/bdd/steps/<domain>/`. Use `TestWorld` and `TestDataFactory`.
3. **Add unit tests** — Cover edge cases and error paths with co-located `*.test.ts` files.
4. **Add component tests** — New Svelte components get `*.svelte.test.ts` using browser mode.
5. **Update contract snapshots** — If you changed public exports: `pnpm test:contract -- --update`.
6. **Consider fuzz testing** — Data transformation functions benefit from property-based tests in `tests/fuzz/`.
7. **Add test data** — New response types need factory methods in `tests/bdd/support/fixtures.ts`.

## Test Infrastructure

| File | Purpose |
|---|---|
| `vitest.config.ts` | Root config (coverage thresholds, path aliases) |
| `vitest.workspace.ts` | Workspace definition (all packages + apps) |
| `tests/bdd/support/world.ts` | `TestWorld` — shared BDD test context |
| `tests/bdd/support/fixtures.ts` | `TestDataFactory` — factory methods for mock data |
| `tests/bdd/support/mocks.ts` | `MockSupabaseClient`, `MockPartySocket`, `createMockFetch` |
| `tests/release/comparators/json-comparator.ts` | Semantic JSON diff for artifact regression |

## Deep Dive

For full details on BDD test patterns, TDD patterns, test architecture decisions, mocking strategies, debugging, and known gaps, see the full [Testing Guide](./TESTING.md).
