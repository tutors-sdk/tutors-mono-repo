# Mutation Testing (Tier 8)

Mutation testing measures how well your tests detect code changes. StrykerJS introduces small bugs (mutations) into the source code — flipping operators, removing conditionals, changing return values — and checks whether the existing test suite catches each one. A mutation that tests fail to detect is a **survivor**, indicating a gap in test quality.

## Why Mutation Testing?

Coverage tells you which lines were *executed*. Mutation testing tells you which lines were *actually tested*. A file can show 100% line coverage while having zero meaningful assertions — mutations expose this gap.

## Target Score

The twelve targeted modules hold a **90% mutation score**: the `break` threshold in `stryker.config.json` fails the nightly `mutation` job below it (Rule 0113). Every other library module is held to its own measured floor by the comprehensive nightly run below.

## Targeted Modules

Mutation testing focuses on high-value computation logic where undetected bugs would silently corrupt output:

| Module | File | Why |
|---|---|---|
| Search | `packages/jsr/model/src/services/search.ts` | Fenced code detection, index calculation — off-by-ones corrupt results |
| LO Utils | `packages/jsr/model/src/utils/lo-utils.ts` | Tree traversal, sorting, filtering — wrong order breaks course display |
| Type Utils | `packages/jsr/model/src/types/type-utils.ts` | Type guards, composite detection — wrong type silently misroutes LOs |
| Calendar Model | `packages/jsr/time/src/services/base-calendar-model.ts` | Median calculation, pivoting — wrong math corrupts instructor analytics |
| Calendar Utils | `packages/jsr/time/src/utils/calendar-utils.ts` | Date formatting, colour grading — visual bugs in heatmaps |
| LO Tree | `packages/jsr/model/src/services/lo-tree.ts` | Parent links, breadcrumbs, composite panels — a wrong link breaks navigation |
| Course Utils | `packages/jsr/model/src/utils/course-utils.ts` | Table of contents, companions, walls, calendar — wrong grouping hides content |
| Markdown Utils | `packages/jsr/model/src/utils/markdown-utils.ts` | Markdown to HTML, course URL rewriting — broken links and images |
| Lab Model | `packages/jsr/time/src/services/base-lab-model.ts` | Lab and step pivots, medians — wrong numbers in lab analytics |
| Lab Utils | `packages/jsr/time/src/utils/lab-utils.ts` | Lab record aggregation — wrong totals per student |
| LR Utils | `packages/jsr/gen/src/utils/lr-utils.ts` | Learning-resource discovery, video ids, front matter — missing resources in generated courses |
| Template Utils | `packages/jsr/gen/src/templates/utils.ts` | Generated page helpers — broken links in the generated site |

Each module has its own floor in `tests/mutation/mutation-floors.json`, checked by `pnpm check:mutation-floors` after the nightly run (Rule 0114).

## Comprehensive nightly run

The nightly `mutation-nightly` job mutates every TypeScript source file under `packages/*/*/src` and `packages/*/*/*/src` (the same files the coverage run measures) and runs the unit, BDD and contract suites against each mutant (Rule 0116). Its configuration is `stryker.nightly.config.json` with `vitest.config.mutation-nightly.ts`; locally:

```bash
pnpm test:mutation:nightly     # about 20 minutes on 4 cores; writes reports/mutation-nightly/
pnpm check:mutation-floors reports/mutation-nightly/mutation.json \
  --floors tests/mutation/nightly-mutation-floors.json --stale warn
```

The first baseline (2026-09-26) scored **58.5%** over 95 modules and 6,073 scored mutants: 1,896 of them sit in code no test reaches, so this run is the map of where tests are missing, while the twelve targeted modules keep their 90% aggregate.

How it stays consistent and safe:

- **Floors per module** (Rule 0117). Every module has a floor in `tests/mutation/nightly-mutation-floors.json`, set to its measured score rounded down. A module below its floor, or a new module with no floor, fails the night and is named in the job summary. Add a floor for a new module with `--update` in the commit that adds it.
- **Improvements never fail the night** (Rule 0119). A score 2 or more points above its floor is listed in the summary as a floor to raise, with `--stale warn`, instead of failing a run no pull request is waiting on. Raise it with `--update` in any later change.
- **Deterministic runs.** The run uses the same workspace aliases and `no-network.ts` setup as the main suite, and two consecutive local runs on 2026-09-26 gave identical scores for all 95 modules.
- **In place, and proven clean** (Rule 0118). The run mutates the working tree in place, because a Vitest `vi.mock` by relative `node_modules` path cannot match inside Stryker's symlinked sandbox. Type-check suppression is off, so only mutated files are touched, and a `git diff --exit-code --stat` step after Stryker (run even when Stryker fails or times out) fails the night if any tracked file was left changed. Locally, a run you interrupt leaves mutated sources behind: restore them with `git checkout -- packages`.

## Running

```bash
# All targeted modules
./tests/mutation/run-mutation-tests.sh

# Single module
./tests/mutation/run-mutation-tests.sh --module search
./tests/mutation/run-mutation-tests.sh --module calendar
./tests/mutation/run-mutation-tests.sh --module time
./tests/mutation/run-mutation-tests.sh --module model
./tests/mutation/run-mutation-tests.sh --module lo-utils

# With custom concurrency
STRYKER_CONCURRENCY=2 ./tests/mutation/run-mutation-tests.sh
```

## When to Run

Mutation testing is **slow** (minutes to hours depending on test suite size and mutant count). It should run:

- **Nightly CI** — scheduled pipeline, results reviewed next morning
- **RC validation** — before cutting a release, as part of the release readiness checklist
- **After major test additions** — to verify new tests actually improve kill rates

It should **not** run on every commit or PR — the feedback loop is too slow.

## Reading the Report

After running, open `reports/mutation/index.html`. Key metrics:

- **Mutation Score**: percentage of mutants killed (target: ≥85%)
- **Survived**: mutants the test suite didn't catch — each is a test gap
- **No Coverage**: mutants in code not reached by any test
- **Timeout**: mutants that caused infinite loops (counted as killed)

### Acting on Survivors

Each survivor shows the exact code change and its location. To improve the score:

1. Open the survivor in the HTML report
2. Understand what the mutation changed (e.g., `>` to `>=`)
3. Write a test that would fail with that specific change
4. Re-run mutation testing for that module to confirm the kill

## Excluded Mutations

The config excludes `StringLiteral` and `ObjectLiteral` mutations. These produce noisy survivors (e.g., changing an error message string) that don't indicate real test gaps.

## Configuration

See `stryker.config.json` at the repo root. Key settings:

```json
{
  "testRunner": "vitest",
  "mutate": ["packages/jsr/model/src/...", "packages/jsr/time/src/..."],
  "thresholds": { "high": 85, "low": 75, "break": 90 },
  "concurrency": 4
}
```

- `high` (85): green in report — tests are strong
- `low` (75): yellow — tests need attention
- `break` (90): the nightly `mutation` job fails — the floor sits under the measured score (93.6) and only rises
