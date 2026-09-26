# Mutation Testing (Tier 8)

Mutation testing measures how well your tests detect code changes. StrykerJS introduces small bugs (mutations) into the source code — flipping operators, removing conditionals, changing return values — and checks whether the existing test suite catches each one. A mutation that tests fail to detect is a **survivor**, indicating a gap in test quality.

## Why Mutation Testing?

Coverage tells you which lines were *executed*. Mutation testing tells you which lines were *actually tested*. A file can show 100% line coverage while having zero meaningful assertions — mutations expose this gap.

## Target Score

The project targets an **85% mutation score** — meaning at least 85% of introduced mutants must be killed by tests. This is enforced via the `break` threshold in `stryker.config.json` (build fails below 60%, warnings below 70%).

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
