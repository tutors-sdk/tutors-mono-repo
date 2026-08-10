# Tutors Testing Strategy

A comprehensive, multi-tier testing framework built around BDD-first principles and the EARS (Easy Approach to Requirements Syntax) methodology. Each tier serves a distinct purpose in the quality pipeline — from fast unit checks to full contract validation.

---

## Tier 1: TDD Unit Tests (`tests/unit/`)

**Approach**: Pure function testing with Vitest. Each test file targets exported functions from a single source module, validating inputs, outputs, edge cases, and error paths in isolation — no DOM, no network, no framework coupling.

**Importance**: Unit tests are the foundation of the testing pyramid. They run in milliseconds, catch regressions instantly, and serve as living documentation of each function's contract. For the Tutors monorepo, the JSR packages (`model`, `time`, `gen`) contain critical computation logic (calendar pivoting, median calculations, search indexing, LO tree traversal) that must be bulletproof — a bug in `median()` silently corrupts analytics for every instructor. Unit tests make these guarantees explicit and enforceable.

**Coverage targets**: Statements 90%, Branches 80%, Functions 75%, Lines 90%.

---

## Tier 2: BDD Behavioral Tests (`tests/bdd/`)

**Approach**: Gherkin feature files describe system behaviour from the perspective of three user personas (student, instructor, developer). Each scenario is annotated with an EARS tag classifying the requirement type. Step definitions in TypeScript exercise the application logic through the `TestWorld` shared state, using mock services for external dependencies.

**EARS Classification**:
- `@ears-ubiquitous` — The system SHALL [behaviour]. Always-on requirements with no trigger.
- `@ears-event-driven` — WHEN [event] the system SHALL [behaviour]. Triggered by user actions.
- `@ears-state-driven` — WHILE [state] the system SHALL [behaviour]. Behaviour depends on current state.
- `@ears-unwanted` — IF [condition] THEN the system SHALL [response]. Error handling and edge cases.
- `@ears-optional` — WHERE [feature is enabled] the system SHALL [behaviour]. Configurable features.

**Importance**: BDD tests bridge the gap between user intent and code. By writing scenarios in plain language first, we ensure features are specified before implementation and that every requirement is traceable to a test. The three-persona split (student, instructor, developer) ensures coverage from all stakeholder angles — a student navigating labs has fundamentally different needs from an instructor reviewing analytics or a developer configuring themes. EARS tags make requirement types explicit, so reviewers can quickly audit whether error paths (`@ears-unwanted`) and optional features (`@ears-optional`) have adequate coverage.

---

## Tier 3: Component Tests (`tests/components/`)

**Approach**: Svelte 5 components tested with `@testing-library/svelte` in a `happy-dom` environment. Tests verify rendering, user interaction, accessibility attributes, and reactive state updates ($state, $derived) without a real browser.

**Importance**: The Tutors UI has components across three packages — `ui-components` (learning objects, time views), `ui-navigators` (MainNavigator, SecondaryNavigator, Footer, TutorsShell), and `ui-primitives` (Icon, Menu, Sidebar, Image) — plus 8 reactive stores in `runes`. Component tests catch rendering regressions, broken event handlers, and accessibility violations at build time — problems that unit tests can't reach (they test functions, not markup) and E2E tests catch too late (they're slow and flaky). For a learning platform, accessibility is non-negotiable: component tests verify ARIA attributes, focus management, and keyboard navigation are correct before code reaches a browser.

---

## Tier 4: Contract Tests (`tests/contract/`)

**Approach**: Zod schemas define the expected shape of every external API surface — Supabase table rows (6 tables), RPC responses (2 RPCs), PartyKit WebSocket messages (LoRecord protocol), and generated course JSON structure. Tests validate that mock data conforming to these schemas is accepted, and that malformed data is rejected.

**Importance**: Tutors depends on three external services (Supabase, PartyKit, GitHub OAuth) plus its own course JSON format. When any of these change shape — a Supabase column renamed, a PartyKit message field added, a course JSON property dropped — the app breaks silently at runtime. Contract tests make these API boundaries explicit and testable. A failing contract test tells you exactly which service changed and which field is affected, before the bug reaches users. This is especially critical for the `learning_records` and `calendar` tables, which drive all analytics features.

---

## Tier 5: Fuzz Tests (`tests/fuzz/`)

**Status**: Active via `pnpm test:fuzz` (`vitest.config.fuzz.ts`, threads pool). Uses a dedicated vitest config with `pool: "threads"` because fast-check v4 property generation crashes vitest's default fork pool workers. Runs in CI on every push/PR.

**Approach**: Property-based testing with `fast-check`. Generators produce random but valid inputs (calendar entries, LO trees) and assert invariants that must hold for all inputs — totals are non-negative, medians are within range, tree traversals visit every node.

**Importance**: Fuzz tests find edge cases that humans miss. A hand-written test might check 5 calendar entries, but a fuzz test checks 10,000 random combinations — including empty arrays, single elements, duplicate dates, and extreme values. For the calendar analytics engine, fuzz testing is essential: the `buildPivotedRows` and `median` functions must handle any student count, any date range, and any activity distribution without crashing or producing nonsensical results.

---

## Tier 6: E2E Tests (`apps/*/tests/e2e/`)

**Approach**: Playwright tests running against the actual SvelteKit dev server. Tests simulate real user flows across the three apps (reader:5173, catalogue:5175, live:5174) in Chromium and Firefox.

**Importance**: E2E tests are the final validation gate. They catch integration issues that no other tier can: SSR hydration mismatches, auth redirect loops, WebSocket connection failures, and cross-app navigation bugs. They're slow and expensive, so they run nightly and in RC validation — not on every commit.

---

## Tier 7: Release Validation (`tests/release/`)

**Approach**: Artifact regression testing, performance benchmarks, and smoke tests that compare generated output against known-good baselines using the `json-comparator`.

**Importance**: Release validation ensures that a new build produces the same course JSON structure as the previous release. This is the last gate before deployment — it catches any change (intentional or not) to the generated output format that could break deployed courses.

---

## Tier 8: Mutation Tests (`tests/mutation/`, `stryker.config.json`)

**Approach**: StrykerJS with the Vitest test runner. Introduces small code changes (mutants) — flipping operators, removing conditionals, changing return values — into targeted source modules and checks whether the existing test suite catches each one. Focuses on high-value computation logic: `search.ts`, `lo-utils.ts`, `type-utils.ts`, `base-calendar-model.ts`, `calendar-utils.ts`.

**Importance**: Code coverage measures which lines were *executed*, but not whether assertions actually verified them. A file can show 100% line coverage with zero meaningful assertions — mutation testing exposes this. Each surviving mutant points to a specific test gap: a conditional that could be inverted, an operator that could be swapped, or a return value that could change — all without any test failing. For the Tutors analytics engine, where a wrong median or a flipped comparison silently corrupts instructor dashboards, mutation testing is the final proof that the test suite has real detection power.

**Target score**: ≥85% mutation score. Build breaks below 60%.

**When to run**: Nightly CI and RC validation — too slow for every commit.

See `guides/MUTATION-TESTING.md` for full details.

---

## Tier 9: Schema-Driven Tests (`tests/fuzz/schema-driven.fuzz.test.ts`, `tests/contract/support/schema-*`)

**Status**: Active as part of `pnpm test:fuzz`. Schema support infrastructure (`schema-generators.ts`, `schema-snapshots.ts`, `schemas.ts`) is also used by contract tests.

**Approach**: Bridges Zod schemas (from contract tests) to fast-check arbitraries for property-based testing. A `zodToArbitrary()` converter generates random-but-valid data from any Zod schema, enabling three capabilities: (1) round-trip validation — generated data always passes the originating schema, (2) schema snapshot regression — a `zodToJsonSchema()` converter creates JSON Schema snapshots that detect unintended drift, (3) boundary validation — `schema-validated-fixtures.ts` wraps BDD fixture factories with Zod `.parse()` calls so every fixture conforms to the canonical API shape.

**Importance**: Hand-crafted test fixtures drift from real API shapes over time. A fixture missing a field that the API added, or using a string where the API now expects a number, means the test passes but the code would fail in production. Schema-driven generation eliminates this class of bugs by deriving test data directly from the Zod schemas that define the API contract. The snapshot comparison catches schema changes that would otherwise be invisible until a deploy breaks — someone renames a Supabase column and the snapshot test fails immediately, before any feature test has to discover the breakage.

---

## Running Tests

```bash
# All unit + BDD + component tests
pnpm vitest run

# Specific tier
pnpm vitest run tests/unit/
pnpm vitest run tests/bdd/
pnpm vitest run tests/components/
pnpm vitest run tests/contract/

# With coverage
pnpm vitest run --coverage

# E2E (requires dev server running)
pnpm --filter reader exec playwright test

# Mutation testing (slow — nightly/RC only)
./tests/mutation/run-mutation-tests.sh
./tests/mutation/run-mutation-tests.sh --module search

# Schema snapshot regression
pnpm vitest run tests/mutation/schema-snapshot.test.ts
```

## File Naming Conventions

| Tier | Pattern | Example |
|---|---|---|
| Unit | `*.test.ts` | `search.test.ts` |
| BDD Feature | `*.feature` | `course-discovery.feature` |
| BDD Steps | `*.steps.ts` | `course-discovery.steps.ts` |
| Component | `*.test.ts` | `Sidebar.test.ts` |
| Contract | `*.contract.test.ts` | `learning-records.contract.test.ts` |
| Fuzz | `*.fuzz.test.ts` | `calendar-model.fuzz.test.ts` |
| Mutation | `stryker.config.json` | `stryker.config.json` |
| Schema Snapshot | `*.test.ts` | `schema-snapshot.test.ts` |
