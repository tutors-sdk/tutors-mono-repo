# Testing Guide for Tutors Mono Repo

> For a quick-reference overview, see [Testing Overview](./TESTING-OVERVIEW.md).

## Overview

Tutors uses a multi-tier testing strategy to ensure correctness at every level — from individual utility functions to full end-to-end user journeys. BDD is the **primary testing paradigm**: every significant user-facing behavior has a corresponding Gherkin feature file. The strategy is adapted from [ESI.ts](https://github.com/lgriffin/ESI.ts/blob/master/guides/TESTING.md) and extended with release candidate (RC) protection gates for production-grade release safety.

| Tier                         | Purpose                                                                    | Runner         |
| ---------------------------- | -------------------------------------------------------------------------- | -------------- |
| 1. TDD (unit)                | Per-module unit tests with mocked dependencies                             | Vitest / Deno  |
| 2. BDD (behavioral)          | Gherkin-style scenarios covering user-facing behaviors                     | Vitest         |
| 3. Component (browser)       | Svelte component rendering in real browser (Vitest Browser Mode)           | Vitest         |
| 4. Integration (mocked)      | Cross-package workflows with mocked Supabase/PartyKit                      | Vitest         |
| 5. E2E (Playwright)          | Full user journeys against real dev server                                 | Playwright     |
| 6. Contract (API surface)    | Snapshot-based public API breaking-change detector for JSR packages        | Vitest         |
| 7. Fuzz (fast-check)         | Property-based testing of data models, tree construction, aggregation (excluded from default run — pending fast-check v4 fix) | Vitest         |

Existing tests in the codebase (gen-lib Deno tests, course package Vitest tests) are preserved and incorporated into this framework. As new tests are written, this table will be updated with exact counts.

## Coverage

Coverage thresholds (enforced per-package via Vitest config):

| Metric     | Threshold | Target |
| ---------- | --------: | -----: |
| Statements |       90% |    95% |
| Branches   |       80% |    85% |
| Functions  |       75% |    90% |
| Lines      |       90% |    95% |

Coverage is collected from all `src/**/*.ts` and `src/**/*.svelte` files (excluding `.d.ts`, `*.config.*`, and test files). The CI pipeline hard-fails if any package drops below thresholds.

## Test Structure

```
tutors-mono-repo/
├── vitest.config.ts                          # Root-level Vitest config (coverage thresholds, path aliases)
├── vitest.workspace.ts                       # Vitest workspace (all packages + apps)
├── tests/                                    # Root-level cross-cutting test suites
│   ├── bdd/                                  # BDD tests (Gherkin features + step definitions)
│   │   ├── features/
│   │   │   ├── course/                       # Course reader features
│   │   │   │   ├── course-loading.feature
│   │   │   │   └── course-navigation.feature
│   │   │   ├── live/                         # Live dashboard features
│   │   │   │   └── presence-tracking.feature
│   │   │   ├── time/                         # Analytics features
│   │   │   │   ├── calendar-analytics.feature
│   │   │   │   └── lab-analytics.feature
│   │   │   └── shared/                       # Cross-app features
│   │   │       ├── authentication.feature
│   │   │       └── theming.feature
│   │   ├── steps/                            # Step definitions (vitest)
│   │   │   ├── course/
│   │   │   ├── live/
│   │   │   └── time/
│   │   └── support/
│   │       ├── world.ts                      # TestWorld class (shared test context)
│   │       ├── fixtures.ts                   # TestDataFactory (factory methods)
│   │       └── mocks.ts                      # MockSupabaseClient, MockPartySocket, createMockFetch
│   ├── contract/                             # API surface snapshot tests
│   │   ├── model-lib-api.test.ts
│   │   ├── time-lib-api.test.ts
│   │   └── gen-lib-api.test.ts
│   ├── fuzz/                                 # Property-based tests (fast-check)
│   │   ├── calendar-model.fuzz.test.ts
│   │   └── lo-tree-construction.fuzz.test.ts
│   ├── integration/                          # Cross-package integration tests
│   └── release/                              # Release artifact testing
│       ├── scripts/
│       │   ├── fetch-reference-course.ts
│       │   ├── generate-baseline.ts
│       │   ├── generate-candidate.ts
│       │   ├── compare-artifacts.ts
│       │   ├── visual-regression.ts
│       │   ├── performance-benchmark.ts
│       │   └── smoke-test-preview.ts
│       └── comparators/
│           └── json-comparator.ts
├── apps/
│   ├── reader/                               # App-level tests
│   │   ├── playwright.config.ts
│   │   └── tests/e2e/                        # E2E tests
│   ├── catalogue/
│   │   ├── playwright.config.ts
│   │   └── tests/e2e/
│   └── live/
│       ├── playwright.config.ts
│       └── tests/e2e/
├── packages/
│   ├── jsr/gen/test/                         # Existing Deno tests (preserved)
│   └── svelte/course/src/.../__ tests__/     # Existing Vitest tests (preserved)
└── .github/workflows/
    ├── ci.yml                                # PR checks
    ├── nightly.yml                           # Scheduled regression
    ├── rc-validation.yml                     # RC gate pipeline
    └── release-testing.yml                   # Artifact regression
```

## Running Tests

```bash
# All unit + BDD tests (default) via Turborepo
pnpm test

# Root-level BDD/contract/fuzz only
pnpm test:bdd
pnpm test:contract
pnpm test:fuzz

# All tests including E2E (full validation)
pnpm check:all
```

### Running Subsets

```bash
# Individual tiers
pnpm turbo test                       # Tier 1: TDD unit tests (all packages + apps)
pnpm test:bdd                         # Tier 2: BDD behavioral tests
pnpm turbo test:components            # Tier 3: Svelte component tests (browser mode)
pnpm test:integration                 # Tier 4: Cross-package integration tests
pnpm turbo test:e2e                   # Tier 5: Playwright E2E tests
pnpm test:contract                    # Tier 6: API surface contract tests
pnpm test:fuzz                        # Tier 7: Property-based fuzz tests
pnpm test:cli                         # CLI tests (Deno test runner)

# Per-package tests
pnpm --filter @tutors/course test
pnpm --filter @tutors/runes test
pnpm --filter @tutors/community test

# Per-app tests
pnpm --filter tutors-reader test
pnpm --filter tutors-catalogue test
pnpm --filter tutors-live test

# E2E for a specific app
pnpm --filter tutors-reader test:e2e
pnpm --filter tutors-reader test:e2e:ui      # Interactive Playwright UI

# With coverage
pnpm vitest run --coverage            # Root-level coverage

# Watch mode
pnpm --filter tutors-reader test:watch

# Run tests related to changed files only
pnpm --filter tutors-reader test:changed

# Release artifact testing
pnpm test:release
pnpm test:release:smoke
pnpm test:release:bench
```

## Test Tiers

### Tier 1: TDD Unit Tests

**Location:** Co-located `*.test.ts` files within each package and app
**Config:** Per-package `vitest.config.ts` + `vitest.workspace.ts`
**Run:** `pnpm turbo test`

Per-package unit test coverage targets:

| Package               | What to test                                                                   |
| --------------------- | ------------------------------------------------------------------------------ |
| `@tutors/course`      | LO tree traversal, `decorateCourseTree()`, URL/route handling, markdown parsing |
| `@tutors/runes`       | Reactive state stores, derived state computations, state reset logic           |
| `@tutors/community`   | Supabase query building, analytics data aggregation, presence event handling   |
| `@tutors/connect`     | Auth session management, OAuth callback handling, profile loading              |
| `@tutors/themes`      | Theme switching, icon resolution, display mode toggling                        |
| `@tutors/logger`      | Log level filtering, message formatting                                        |
| `@tutors/a11y`        | ARIA attribute generation, keyboard navigation helpers                         |
| `@tutors/i18n`        | Translation key lookup, locale switching, fallback handling                    |
| `@tutors/ui-primitives` | Component prop validation, event handler logic                               |
| `@tutors/ui-navigators` | Navigator shells, main/secondary navigation, footer layout                   |
| `@tutors/ui-components` | Compound component composition, slot handling                                |
| JSR: `model`          | Type guard functions (`isCompositeLo()`, `isLab()`, etc.), search utilities    |
| JSR: `time`           | `CalendarModel` building, `LabModel` building, date formatting utilities       |
| JSR: `gen`             | File system operations, template engine, course parsing (existing Deno tests)  |

### Tier 2: BDD Behavioral Tests

**Location:** `tests/bdd/`
**Config:** `vitest.config.ts` (root level, includes `tests/**/*.steps.ts`)
**Run:** `pnpm test:bdd`

Gherkin feature files covering 5 domains:

| Domain   | Feature File                  | Scenarios | Description                                             |
| -------- | ----------------------------- | --------: | ------------------------------------------------------- |
| Course   | `course-loading.feature`      |         4 | Loading courses by URL, nested units, error handling     |
| Course   | `course-navigation.feature`   |         4 | Topic-lab navigation, search, breadcrumbs                |
| Live     | `presence-tracking.feature`   |         4 | WebSocket presence, student tracking, disconnect         |
| Time     | `calendar-analytics.feature`  |         5 | Calendar heatmaps, day/week views, engagement            |
| Time     | `lab-analytics.feature`       |         4 | Lab completion grids, step breakdowns                    |
| Shared   | `authentication.feature`      |         4 | GitHub OAuth, anonymous vs authenticated access          |
| Shared   | `theming.feature`             |         4 | Dark mode, themes, dyslexia font, card layouts           |

#### BDD Best Practices

- Feature files should be readable by non-developers — avoid implementation details in Given/When/Then steps
- One feature file per user-facing capability, not per component or function
- Use `Background` for shared setup across scenarios within a feature
- Use `Scenario Outline` + `Examples` for data-driven tests with multiple inputs
- Step definitions should be thin — delegate to `TestWorld`, `TestDataFactory`, and service methods
- Include the user persona in the feature description ("As a student", "As an instructor")

### Tier 3: Component Tests (Vitest Browser Mode)

**Location:** Co-located `*.svelte.test.ts` files
**Config:** Per-app `vitest.config.ts` with `@vitest/browser` provider
**Run:** `pnpm turbo test:components`

Component tests render Svelte 5 components in a real browser (Chromium via Playwright) using `vitest-browser-svelte`. This catches rendering bugs, event handling issues, and accessibility problems that JSDOM cannot.

Target coverage:

- **`@tutors/ui-primitives`** — Icon, IconBar, Image, Menu, MenuItem, TutorsIcon, NotFound
- **`@tutors/ui-navigators`** — MainNavigator, SecondaryNavigator, Footer, TutorsShell
- **`@tutors/ui-components`** — Card renderers, learning object views, time views
- **`apps/reader`** — Lab, Talk, Video, Note renderers, search overlay, breadcrumbs
- **`apps/live`** — Student cards, course cards, presence indicators
- **`apps/catalogue`** — Course cards, filtering, catalogue layout

### Tier 4: Integration Tests (Vitest, Mocked Services)

**Location:** `tests/integration/`
**Config:** `vitest.config.ts` (root level)
**Run:** `pnpm test:integration`

Cross-package workflow tests with mocked external services. These verify the data flow pipeline between packages without hitting real APIs.

| Suite                          | Description                                                    | External Mock   |
| ------------------------------ | -------------------------------------------------------------- | --------------- |
| `course-service.test.ts`       | Course URL > fetch > JSON parse > model decoration > tree      | Fetch (MSW)     |
| `presence-service.test.ts`     | PartyKit message > event parse > state update > UI data        | MockPartySocket |
| `analytics-pipeline.test.ts`   | Supabase query > calendar/lab model building > grid data       | MockSupabase    |
| `auth-flow.test.ts`            | GitHub OAuth > session creation > profile loading              | MSW handlers    |

### Tier 5: E2E Tests (Playwright)

**Location:** Per-app `tests/e2e/` directories
**Config:** Per-app `playwright.config.ts`
**Run:** `pnpm turbo test:e2e`

Full user journey tests running against a real Vite dev server:

| App           | Planned Suites                                                   |
| ------------- | ---------------------------------------------------------------- |
| `reader`      | Course browsing, lab interaction, search, authentication         |
| `live`        | Dashboard loading, presence display, catalogue browsing          |
| `catalogue`   | Course catalogue browsing, filtering, navigation                 |

E2E tests are the slowest tier and are **not** part of `pnpm test`. They run in CI on every PR and nightly.

### Tier 6: Contract / API Surface Tests

**Location:** `tests/contract/`
**Config:** `vitest.config.ts` (root level)
**Run:** `pnpm test:contract`

Snapshot the public API surface of each JSR-published package. Acts as a **breaking-change detector** — if someone renames a function, removes an export, or changes a type guard, this test fails immediately before the change ships as a semver-violating release.

| Suite                    | What it validates                                            |
| ------------------------ | ------------------------------------------------------------ |
| `model-lib-api.test.ts`  | Module exports, stable export names, type guard functions    |
| `time-lib-api.test.ts`   | Module exports, stable export names, service classes/types   |
| `gen-lib-api.test.ts`    | Module exports, stable export names, generation functions    |

Each test uses `toMatchSnapshot()` for the full export list, so any addition, removal, or rename is caught.

### Tier 7: Property-Based / Fuzz Tests (fast-check)

**Location:** `tests/fuzz/`
**Config:** `vitest.config.fuzz.ts` (dedicated config with `pool: "threads"`)
**Status:** Active via `pnpm test:fuzz`. Uses a separate vitest config with threads pool because fast-check v4 property generation crashes vitest's default fork pool workers. Runs in CI on every push/PR.

[fast-check](https://github.com/dubzzz/fast-check) property-based testing:

| Suite                              | What it fuzzes                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `calendar-model.fuzz.test.ts`      | Calendar row building with random entries, median computation with random arrays |
| `lo-tree-construction.fuzz.test.ts`| LO tree construction with random depth/type combinations, parent ref integrity   |

Properties verified (200 runs each, elevated to 1000 in RC):

- Non-negative time values for any combination of inputs
- One row per unique student in output
- Total seconds correctness (sum of all timeactive)
- Valid medians (between min and max, always finite)
- Node count invariant (countNodes equals input length)
- Depth bound (maxDepth <= max input depth + 1)
- Parent reference correctness
- Valid routes (non-empty, starts with `/`)

## How Tests Work

### Configuration

Three levels of Vitest configuration:

| Config                   | Scope                        | Coverage    | Environment | Timeout |
| ------------------------ | ---------------------------- | ----------- | ----------- | ------- |
| `vitest.config.ts`       | Root-level (BDD, contract, fuzz, integration) | v8, thresholds enforced | Node | Default |
| `vitest.workspace.ts`    | All packages + apps          | Per-project | Per-project | Default |
| Per-app `vitest.config.ts` | App-specific tests           | v8          | happy-dom   | Default |

### Mocking

All unit and BDD tests use mocked external services. No real HTTP requests, WebSocket connections, or database queries are made during Tiers 1-4.

| Service              | Mock Class/Function      | Capabilities                                              |
| -------------------- | ------------------------ | --------------------------------------------------------- |
| Supabase             | `MockSupabaseClient`     | Query builder chain (select, eq, neq, gte, lte, order, limit, single) |
| PartyKit WebSocket   | `MockPartySocket`        | `simulateMessage(data)`, `simulateClose()`, `readyState`  |
| HTTP Fetch           | `createMockFetch()`      | URL pattern matching, custom response handlers, 404 default |

### Test Helpers

#### TestWorld (`tests/bdd/support/world.ts`)

Shared context object for BDD step definitions. Holds the state that flows between Given/When/Then steps:

```typescript
export class TestWorld {
  fixtures: TestDataFactory;
  course: Course | null = null;
  presenceEvents: PresenceEvent[] = [];
  onlineStudents: Map<string, PresenceEvent> = new Map();
  calendarData: Array<{ studentid: string; timeactive: number; id: string }> = [];
  authenticated: boolean = false;
  error: Error | null = null;

  reset(): void { /* resets all fields */ }
}
```

#### TestDataFactory (`tests/bdd/support/fixtures.ts`)

Factory for creating mock data with sensible defaults and optional overrides:

```typescript
const factory = new TestDataFactory();
const course = factory.createCourse({ title: "Test Course", id: "test-101" });
const student = factory.createStudent({ name: "Alice", onlineStatus: "online" });
const entry = factory.createCalendarEntry({ studentid: student.id, timeactive: 45 });
```

## Adding New Tests

### Checklist

1. **Start with BDD**: Write the Gherkin feature file first. What behavior does the user expect? Place it in `tests/bdd/features/<domain>/`.
2. **Write step definitions**: Create matching `*.steps.ts` in `tests/bdd/steps/<domain>/`. Use `TestWorld` for shared state and `TestDataFactory` for mock data.
3. **Add unit tests**: Cover edge cases, error paths, and implementation details with co-located `*.test.ts` files.
4. **Add component tests**: If there's a new Svelte component, add `*.svelte.test.ts` using `vitest-browser-svelte`.
5. **Update contract snapshots**: If you've added/changed public exports from a `packages/jsr/*` package, update the corresponding contract test snapshot (`pnpm test:contract -- --update`).
6. **Consider fuzz testing**: If the code handles arbitrary input (parsing, tree construction, data aggregation), add property-based tests in `tests/fuzz/`.
7. **Add test data**: If new response types are needed, add factory methods to `TestDataFactory`.

## BDD Test Pattern

BDD tests use Gherkin `.feature` files with matching step definition files. Feature files describe user-facing behavior in natural language; step definitions implement the test logic.

**Feature file** (`tests/bdd/features/course/course-loading.feature`):

```gherkin
Feature: Course Loading
  As a student
  I want to load a course from its URL
  So that I can access learning materials

  Background:
    Given a published course "web-dev-101" exists
    And the course has 3 topics with 2 labs each

  Scenario: Successfully load a course
    When I request the course "web-dev-101"
    Then the course should load successfully
    And the course title should be "Web Development 101"
    And the course should have 3 topics

  Scenario Outline: Load different learning object types
    Given a learning object of type "<type>" exists in the course
    When I navigate to the learning object
    Then the learning object should have type "<type>"
    And the learning object should have a valid route

    Examples:
      | type     |
      | lab      |
      | talk     |
      | video    |
      | note     |
      | web      |
      | github   |
      | archive  |
```

**Step definitions** (`tests/bdd/steps/course/course-loading.steps.ts`):

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";

describe("Feature: Course Loading", () => {
  let world: TestWorld;

  beforeEach(() => {
    world = new TestWorld();
  });

  describe("Scenario: Successfully load a course", () => {
    it("should load and display the course correctly", () => {
      const course = world.fixtures.createCourseWithTopics("web-dev-101", 3, 2);
      course.title = "Web Development 101";
      expect(course).toBeDefined();
      expect(course.id).toBe("web-dev-101");
      expect(course.title).toBe("Web Development 101");
      expect(course.topics).toHaveLength(3);
    });
  });
});
```

## TDD Test Pattern

Each module has one or more co-located test files. Tests import the module under test, mock dependencies, call functions, and assert results.

```typescript
import { describe, it, expect } from "vitest";

describe("decorateCourseTree", () => {
  it("should assign parent references to all child learning objects", () => {
    const course = createTestCourse();
    decorateCourseTree(course);
    course.topics.forEach(topic => {
      topic.los.forEach(lo => {
        expect(lo.parent).toBe(topic);
      });
    });
  });
});
```

---

## Release Candidate (RC) Protection

### RC Branch Model

```
main (production) <-- rc/vX.Y.Z <-- development (integration)
                      |
                      +-- All CI checks must pass
                      +-- RC validation pipeline runs
                      +-- Manual QA sign-off required
                      +-- Merge to main triggers release
```

**Branch protection rules:**

| Branch        | Required Checks                                                         | Merge Requirements              |
| ------------- | ----------------------------------------------------------------------- | ------------------------------- |
| `development` | lint, typecheck, unit+BDD, contract, fuzz                               | 1 approval, CI green            |
| `rc/*`        | Full RC validation pipeline (all tiers + performance + security + audit) | 2 approvals, all gates green    |
| `main`        | RC validation must have passed on source branch                         | RC branch only, no direct push  |

### RC Validation Pipeline

When an `rc/*` branch is created, the full RC validation pipeline runs automatically via `.github/workflows/rc-validation.yml`. This is the **hardest gate** — it runs every test tier plus production-specific checks.

| Gate | Job(s) | Pass Criteria |
|------|--------|---------------|
| 1 | Lint & Type Check | Zero ESLint errors, zero TypeScript errors |
| 2a | Unit & BDD | All tests pass, coverage above thresholds |
| 2b | Contract | API snapshots match (or intentionally updated) |
| 2c | Fuzz (Extended) | 1000-run fuzz with zero failures (`FUZZ_RUNS=1000 pnpm test:fuzz`) |
| 2d | CLI (Deno) | All Deno tests pass |
| 3a | Build Verification | All apps produce `.svelte-kit/` output |
| 3b | Dependency Audit | Zero critical CVEs |
| 4 | Cross-Browser E2E | Pass on Chromium, Firefox, and WebKit |
| 6 | Artifact Regression | CLI output matches production for reference course |

### Hard-Fail Conditions

The following conditions **block an RC from merging to main**:

| Condition                           | Gate        | Rationale                                                   |
| ----------------------------------- | ----------- | ----------------------------------------------------------- |
| Any test tier fails                 | Gate 2      | Tests exist to prevent regressions                          |
| Coverage drops below thresholds     | Gate 2      | 90% statement / 80% branch / 75% function / 90% line       |
| Contract snapshot mismatch          | Gate 2b     | Unintentional API surface change = semver violation         |
| Production build fails              | Gate 3a     | If it doesn't build, it doesn't ship                       |
| High/critical CVE in dependencies   | Gate 3b     | Known vulnerabilities must be resolved before release       |
| Cross-browser E2E failure           | Gate 4      | Must work on all major browsers                             |
| Artifact regression (missing LOs)   | Gate 6      | CLI must produce identical output for the reference course  |
| Fuzz test failure (1000 runs)       | Gate 2c     | Extended fuzz runs catch edge cases missed at 200 runs      |

### Soft-Fail Conditions (Warnings)

| Condition                              | Action Required                                              |
| -------------------------------------- | ------------------------------------------------------------ |
| Bundle size increase 5-10%             | Justification required in PR description                     |
| New unimplemented BDD feature files    | Tracked in issue, not blocking                               |
| Moderate CVEs in dependencies          | File issue for next sprint                                   |

### Release Readiness Command

```bash
pnpm check:all
```

This runs, in order:

1. `pnpm lint` — ESLint + Prettier
2. `pnpm check` — TypeScript type checking via `svelte-check`
3. `pnpm test` — Vitest unit + BDD tests (Tiers 1-2, all packages + apps via Turborepo)
4. `pnpm test:bdd` — Root-level BDD step definitions
5. `pnpm test:contract` — API surface snapshot tests (Tier 6)
6. `pnpm test:fuzz` — Property-based fuzz tests (Tier 7)
7. `pnpm test:e2e` — Playwright E2E tests across all apps (Tier 5)
8. `pnpm build` — Full production build

### Gate 6: Release Artifact Testing

Beyond developer-centric tests, the RC pipeline includes artifact-level regression testing that compares what the CLI produces against the latest production version.

**Reference course:** [`tutors-sdk/tutors-reference-course`](https://github.com/tutors-sdk/tutors-reference-course)

#### Scripts (`tests/release/scripts/`)

| Script | Purpose | Hard-fail? |
|--------|---------|------------|
| `fetch-reference-course.ts` | Clone/update the reference course from GitHub | Yes |
| `generate-baseline.ts` | Generate JSON artifacts with the published production CLI from JSR | Yes |
| `generate-candidate.ts` | Generate JSON artifacts with the local development CLI | Yes |
| `compare-artifacts.ts` | Deep semantic diff of baseline vs candidate JSON | Yes |
| `visual-regression.ts` | Playwright screenshots of production vs preview | Warning only |
| `performance-benchmark.ts` | CLI generation time, SvelteKit build time, bundle size tracking | Fail on >20% regression |
| `smoke-test-preview.ts` | Critical path smoke tests against deployed preview | Yes |

---

## CI Schedule

### Regular CI (Every Push / PR)

| Job                   | Trigger                | Tests Run                          |
| --------------------- | ---------------------- | ---------------------------------- |
| Lint & Type Check     | Every push/PR          | ESLint, Prettier, svelte-check     |
| Unit & BDD Tests      | Every push/PR          | Tiers 1-2 + coverage              |
| E2E Tests             | Every push/PR          | Tier 5 (Chromium only)             |
| CLI Tests             | Every push/PR          | Deno test runner                   |
| Contract & Fuzz       | PRs only               | Tiers 6-7                          |

### Nightly (Scheduled)

| Job                        | Schedule    | Tests Run                                        |
| -------------------------- | ----------- | ------------------------------------------------ |
| Full E2E Suite             | Daily 3 AM  | All apps, all browsers                           |
| Contract Snapshot Validation | Daily 3 AM | API surface snapshots                            |

### RC Validation (On `rc/*` Branch)

| Job                        | Trigger          | Tests Run                                             |
| -------------------------- | ---------------- | ----------------------------------------------------- |
| All Tiers                  | Push to `rc/**`  | Tiers 1-7, CLI, elevated fuzz (1000 runs)             |
| Cross-Browser E2E          | Push to `rc/**`  | All apps x all browsers (Chromium, Firefox, WebKit)   |
| Build Verification         | Push to `rc/**`  | Production build + bundle size regression check       |
| Dependency Audit           | Push to `rc/**`  | `pnpm audit`, license compliance                      |
| Artifact Regression        | Push to `rc/**`  | CLI output comparison against production              |

---

## Test Architecture Decisions

### Why seven tiers?

Each tier catches a different class of defect:

- **TDD unit tests** — fast, deterministic, cover every code path. Catch implementation bugs immediately.
- **BDD behavioral tests** — Gherkin scenarios readable by non-engineers, verify user-facing behaviors match requirements.
- **Component tests** — Real browser rendering catches Svelte-specific bugs (reactive state, DOM events, CSS) that JSDOM cannot replicate.
- **Integration tests** — Verify cross-package data flow pipelines with deterministic mocked services.
- **E2E tests** — Full user journeys through the real app catch routing, SSR, authentication flows, real browser interactions.
- **Contract tests** — Snapshot-based public API surface tests act as a breaking-change detector.
- **Fuzz tests** — Property-based testing with random inputs finds edge cases that human-written test cases miss.

### Why BDD first?

Every significant user-facing behavior starts as a Gherkin feature file before implementation begins:

1. **Requirements are explicit** — The feature file IS the specification.
2. **Non-engineers can review** — Product owners, instructors, and QA can read and validate feature files.
3. **Coverage is behavior-driven** — We test what the user sees and does, not implementation details.
4. **Regression is human-readable** — When a BDD test fails, the failure message describes a broken user behavior.

### Why both TDD and BDD?

TDD covers the **how** (internal functions, edge cases, error paths). BDD verifies the **what** (user-facing behaviors in Gherkin). The overlap is intentional.

### Why snapshot the public API surface?

The three JSR-published packages (`@tutors/tutors-model-lib`, `@tutors/tutors-gen-lib`, `@tutors/tutors-time-lib`) are consumed by external Deno CLI tools and potentially by third-party integrations. The contract tests act as a semver guard.

### Why RC protection?

The tutors platform serves students and instructors in real educational settings. A broken release can disrupt active courses. The RC gate ensures every test tier passes, cross-browser compatibility is verified, performance regressions are caught, accessibility standards are maintained, and dependency vulnerabilities are resolved — all before code reaches production.

---

## Debugging

```bash
# Run a single test file
pnpm vitest run tests/fuzz/calendar-model.fuzz.test.ts

# Run tests matching a name pattern
pnpm vitest run --testNamePattern="should always produce non-negative"

# Run with verbose output
pnpm vitest run --reporter=verbose

# Update contract snapshots after intentional API changes
pnpm vitest run tests/contract -- --update

# Run fuzz tests with more iterations (for RC validation)
FUZZ_RUNS=1000 pnpm test:fuzz

# Debug with Node inspector
node --inspect-brk node_modules/.bin/vitest run --pool=forks tests/contract/model-lib-api.test.ts
```

## Gaps and Future Work

| Gap                                | Severity | Notes                                                                      |
| ---------------------------------- | -------- | -------------------------------------------------------------------------- |
| No component tests implemented     | Medium   | Tier 3 is scaffolded but has no test files yet                             |
| No integration tests implemented   | Medium   | Tier 4 is scaffolded but has no test files yet                             |
| Limited unit test coverage         | Medium   | Only course and gen packages have tests currently                          |
| No E2E tests for any app           | Medium   | Playwright configs provided, tests need writing                            |
| BDD features without step defs     | Low      | Feature files exist but step definitions are pending                       |
| No performance benchmarks          | Low      | No Tier 2.5 equivalent yet                                                |
| No type tests (tsd equivalent)     | Low      | Consumer type correctness tests not yet set up                             |
| Vitest not in devDependencies      | High     | Must add vitest and related packages to root/per-package devDependencies   |

### Recommended Next Steps

1. **Add testing dependencies** — Add `vitest`, `@vitest/coverage-v8`, `fast-check`, `@playwright/test`, `@testing-library/svelte`, `happy-dom` to package.json devDependencies
2. **Implement BDD step definitions** — Start with course-loading and presence-tracking
3. **Add component tests** — Start with `@tutors/ui-primitives` (highest reuse), then `@tutors/ui-navigators` (navigation shell)
4. **Add integration tests** — Start with course loading pipeline (highest user impact)
5. **Add E2E tests** — Start with reader app course browsing
6. **Add performance benchmarks** — Guard SvelteKit SSR time, LO tree construction, calendar model building

## File Reference

| Path                                              | Purpose                                                   |
| ------------------------------------------------- | --------------------------------------------------------- |
| `vitest.config.ts`                                | Root Vitest config (coverage thresholds, path aliases)    |
| `vitest.workspace.ts`                             | Vitest workspace definition (all packages + apps)         |
| `guides/TESTING.md`                               | This file — comprehensive testing guide                   |
| `guides/TESTING-OVERVIEW.md`                      | Quick-reference testing overview                          |
| `tests/bdd/features/`                             | Gherkin feature files                                     |
| `tests/bdd/steps/`                                | Step definition files                                     |
| `tests/bdd/support/world.ts`                      | TestWorld shared context class                            |
| `tests/bdd/support/fixtures.ts`                   | TestDataFactory (factory methods)                         |
| `tests/bdd/support/mocks.ts`                      | MockSupabaseClient, MockPartySocket, createMockFetch      |
| `tests/contract/`                                 | API surface snapshot suites                               |
| `tests/fuzz/`                                     | Property-based fuzz suites                                |
| `tests/integration/`                              | Cross-package integration tests                           |
| `tests/release/`                                  | Release artifact testing scripts                          |
| `.github/workflows/ci.yml`                        | PR checks                                                 |
| `.github/workflows/nightly.yml`                   | Scheduled regression                                      |
| `.github/workflows/rc-validation.yml`             | RC gate pipeline                                          |
| `.github/workflows/release-testing.yml`           | Artifact regression + smoke tests                         |
