# Performance and capacity (runway tier L)

Four checks, each with negative fixtures in this folder's Vitest suites (`pnpm test:runway`).

| Check | Command | Runs | Fails when |
|---|---|---|---|
| Bundle budgets | `pnpm check:bundle` | PR, after the apps build | An app's total JS, total CSS or largest JS chunk (gzip) exceeds its ceiling in `bundle-budgets.json` |
| Lighthouse | `pnpm check:lighthouse --image <image>` | PR (reader) | A page's median category score falls below its floor in `lighthouse.json`; with `--baseline`, a score or timing regresses beyond noise |
| Load | `pnpm check:load --image <image>` | Nightly | A k6 threshold is crossed: p95 per page, error rate, dropped iterations; with `--baseline`, a page's p95 regresses beyond noise |
| Soak | `pnpm check:load --image <image> --script reader-soak.js --rate 5 --duration 45m` | Nightly | As load, plus memory growth after warm-up and late-phase p95 drift |

## Budgets and floors

Ceilings are the measured size plus 5%, rounded up to a KiB. `pnpm check:bundle --propose` prints new ones. Lowering a ceiling is always welcome; raising one needs a reason in the PR. A page that cannot meet a global Lighthouse floor gets its own `floors` entry with a `why`, rather than a lower global floor.

## Timings are compared statistically

One run of anything is noise. `scripts/checks/lib/stats.ts` compares the median of several runs against the median of baseline runs, and calls a regression only outside a band. The band is the largest of three MADs of the baseline, a relative floor and an absolute floor, so one slow run or a very tight baseline cannot fail a build. Record samples on the CI runner that will be judged; laptop numbers do not transfer.

```bash
pnpm check:load --image tutors/reader:ci --runs 3 --duration 2m --record reports/load-samples.json
pnpm check:lighthouse --image tutors/reader:ci --record reports/lighthouse-samples.json
```

## Setup

- k6 runs from the pinned `grafana/k6` image (digest in `scripts/checks/load-test.ts`) on a private Docker network with the app, so no host ports or local k6 install are needed.
- Lighthouse is installed in isolation so it does not add ~25 packages to every contributor's install:

  ```bash
  pnpm --dir tests/performance/lighthouse install --ignore-workspace --frozen-lockfile
  pnpm exec playwright install chromium
  ```

- The reader renders in the browser, so the course and lab pages fetch course content from a course site. `{course}` and `{lab}` in `lighthouse.json` come from `LIGHTHOUSE_COURSE` and `LIGHTHOUSE_LAB`, which default to the Netlify reference course. The nightly job starts the tier G fixture course (`docker compose -f tests/e2e-stack/compose.yaml up -d --wait course`) and sets them to `localhost:8080` and `unit-1/topic-01/book-lab-01`, so Netlify is not a dependency of the run. It also records its samples (`--record`) as the `lighthouse-samples` artifact, which is what a `--baseline` file is made from.
