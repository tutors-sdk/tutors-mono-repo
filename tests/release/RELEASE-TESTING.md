# Release Candidate Readiness

This document defines what it means for a Tutors release to be ready to ship. It covers the gates a release candidate must pass, how each gate works, and the decision criteria for go/no-go.

---

## What Is a Release Candidate?

A release candidate (RC) is a build from an `rc/**` branch that is proposed for production deployment. Before merging to main and publishing to JSR / deploying to tutors.dev, the RC must pass every gate below.

The release testing pipeline answers one question: **does this build produce the same results as the current production version, and if not, are the differences intentional?**

---

## Release Gates

### Gate 1: Artifact Regression (blocking)

**Goal**: The local CLI must produce byte-identical course JSON to the published production CLI when given the same input.

**How it works**:
1. Fetch the [tutors-reference-course](https://github.com/tutors-sdk/tutors-reference-course) as a fixed input
2. Run the published CLI (`jsr:@tutors/tutors`) against it to produce a **baseline**
3. Run the local CLI (`packages/jsr/tutors/main.ts`) against the same input to produce a **candidate**
4. Compare the two outputs using semantic JSON diff (normalised keys, timestamps ignored) and SHA-256 binary comparison

**Pass criteria**: Zero errors. Warnings (value changes in non-route fields) require manual review and sign-off. Info-level differences (new fields added) are acceptable.

**Scripts**: `fetch-reference-course.ts` → `generate-baseline.ts` → `generate-candidate.ts` → `compare-artifacts.ts`

---

### Gate 2: Reader Build Comparison (blocking)

**Goal**: The SvelteKit reader app build from the RC branch must not introduce unexpected chunk changes or size regressions compared to main.

**How it works**:
1. Build the reader app from main → **reader-baseline**
2. Build the reader app from the RC branch → **reader-candidate**
3. Compare Vite build manifests: chunk additions/removals, hash changes, CSS changes
4. Compare chunk file sizes: flag any chunk with >5% size increase

**Pass criteria**: No removed chunks. Size regressions >5% require justification (new feature, added dependency). Hash changes alone are expected when code changes and are informational only.

**Script**: `compare-reader-builds.ts`

---

### Gate 3: Performance Benchmark (warning)

**Goal**: CLI generation time and SvelteKit build time must not regress by more than 20%.

**How it works**:
1. Run the local CLI against the reference course and measure wall-clock time
2. Run `pnpm --filter tutors-reader... build` and measure wall-clock time
3. Compare against previous benchmark results

**Pass criteria**: This gate is warning-only. A >20% regression does not block the release but must be investigated and documented. Performance characteristics vary by CI runner, so trends matter more than individual runs.

**Script**: `performance-benchmark.ts`

---

### Gate 4: Smoke Tests (blocking)

**Goal**: The deployed production app loads, returns valid HTML, and renders SvelteKit markers.

**How it works**:
1. HTTP GET to the production URL
2. Verify 200 status, valid HTML doctype, SvelteKit app markers

**Pass criteria**: All checks pass. A failure here indicates a deployment or infrastructure problem, not a code issue — but it still blocks the release since it means the current production state is unhealthy.

**Script**: `smoke-test-preview.ts`

---

### Gate 5: Upstream Test Suite (blocking)

**Goal**: All existing automated tests must pass before release testing begins.

These are not part of the release testing scripts but are prerequisites:

| Check | Command | Threshold |
|-------|---------|-----------|
| Unit + BDD + Component + Contract + Fuzz | `pnpm vitest run` | All pass |
| Code coverage | `pnpm vitest run --coverage` | Statements 90%, Branches 80%, Functions 75%, Lines 90% |
| Mutation score | `./tests/mutation/run-mutation-tests.sh` | ≥85% (build breaks below 65%) |
| Schema snapshots | `pnpm vitest run tests/mutation/schema-snapshot.test.ts` | All pass (no drift) |
| TypeScript | `pnpm check` | Zero errors |

---

## Running Release Tests

```bash
# Full pipeline (CLI + reader comparison)
deno run -A tests/release/scripts/run-release-tests.ts --mode=all

# CLI artifact regression only
deno run -A tests/release/scripts/run-release-tests.ts --mode=cli

# Reader build comparison only
deno run -A tests/release/scripts/run-release-tests.ts --mode=reader

# Compare against a specific published version
deno run -A tests/release/scripts/run-release-tests.ts --mode=cli --version=5.0.5

# Individual scripts
deno run -A tests/release/scripts/fetch-reference-course.ts
deno run -A tests/release/scripts/generate-baseline.ts --version=latest
deno run -A tests/release/scripts/generate-candidate.ts
deno run -A tests/release/scripts/compare-artifacts.ts --report=report.json
deno run -A tests/release/scripts/performance-benchmark.ts --mode=all
deno run -A tests/release/scripts/smoke-test-preview.ts --url=https://tutors.dev/...
```

---

## CI Integration

The release testing pipeline runs automatically on pushes to `rc/**` branches and can be triggered manually via `workflow_dispatch`. See `.github/workflows/release-testing.yml`.

| Job | Gate | Blocking |
|-----|------|----------|
| `artifact-regression` | Gate 1 | Yes |
| `performance-benchmark` | Gate 3 | No (warning) |
| `smoke-tests` | Gate 4 | Yes |
| `release-report` | Summary | Fails if any blocking gate fails |

Gate 2 (reader build comparison) and Gate 5 (upstream tests) are run locally or in the main CI workflow, not in the release-specific pipeline.

---

## Go/No-Go Decision

A release candidate is **ready to ship** when:

1. All blocking gates pass (artifact regression, reader build, smoke tests)
2. All upstream tests pass with coverage above thresholds
3. Mutation score is ≥85%
4. Schema snapshots show no unintended drift
5. Any warnings have been reviewed and documented

A release candidate is **blocked** when:

- Artifact regression finds structural differences (missing files, type changes, removed fields)
- Reader build has removed chunks or unexplained size regressions
- Smoke tests fail (production is unhealthy)
- Upstream test suite has failures or coverage below thresholds

A release candidate **needs review** when:

- Artifact comparison shows value changes in non-route fields (expected if the RC intentionally changes output)
- Performance benchmark shows >20% regression
- Reader build shows >5% size increase in any chunk
- Schema snapshots changed (expected if schemas were intentionally updated — regenerate snapshots and commit)

---

## Working Directory

All release testing artifacts are generated under `tests/release/.release-work/` (gitignored):

```
.release-work/
  reference-course/    # cloned tutors-reference-course
  baseline/            # JSON output from published CLI
  candidate/           # JSON output from local CLI
  reader-baseline/     # SvelteKit build from main
  reader-candidate/    # SvelteKit build from RC branch
```

Clean up with: `rm -rf tests/release/.release-work/`

---

## Adding a New Gate

1. Create a script in `tests/release/scripts/`
2. Add a step to the orchestrator (`run-release-tests.ts`)
3. Add a job to `.github/workflows/release-testing.yml` if it should run in CI
4. Document the gate in this file with goal, mechanism, and pass criteria
5. Decide whether the gate is blocking or warning-only
