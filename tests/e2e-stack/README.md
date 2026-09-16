# E2E stack (runway tier G)

Named journeys run against the **built container images**, never `vite dev`,
with a fixture course server so GitHub and Netlify are not dependencies.

```bash
pnpm e2e:stack:fixture                 # scaffold + generate the fixture course (needs Deno)
docker compose up --build --no-start   # or build tutors/<app>:local however you like
pnpm e2e:stack:up                      # reader, catalogue, live, fixture servers
pnpm test:e2e:stack --project=chromium --project=webkit
pnpm test:e2e:stack:ratchet            # fail on stale baseline lines
pnpm e2e:stack:down
```

Ports in use locally? Every published port has an override
(`READER_PORT`, `CATALOGUE_PORT`, `LIVE_PORT`, `READER_UNCONFIGURED_PORT`,
`COURSE_PORT`, `BROKEN_COURSE_PORT`), and the journeys read the matching URLs
(`READER_URL`, `CATALOGUE_URL`, `LIVE_URL`, `READER_UNCONFIGURED_URL`,
`COURSE_ID`, `BROKEN_COURSE_ID`). Images default to `tutors/<app>:local`; set
`TUTORS_TAG` to use another tag.

| File | Purpose |
| --- | --- |
| `fixture-course/build.ts` | Builds the course with the repo's scaffolder (`packages/jsr/create`) and generator (`packages/jsr/gen`) |
| `fixture-course/serve.mjs` | Static server with CORS; `FIXTURE_FAULT=500` makes `tutors.json` fail |
| `compose.yaml` | The stack: `reader`, `reader-unconfigured`, `catalogue`, `live`, `course`, `course-broken` |
| `journeys/journeys.ts` | The journeys, role and accessible-name selectors only, calling `onPage(key)` at each page |
| `journeys/student.journey.spec.ts` | Runs the journeys with axe and reduced-motion audits at every page |
| `journeys/negative.journey.spec.ts` | `test.fail()` journeys: prove a journey can fail, and pin known product bugs |
| `a11y-known-violations.txt`, `reduced-motion-known.txt` | Shrink-only baselines, keyed `<project> \| <page> :: <finding>` |
| `ratchet.mjs` | Stale-line check after a run; `--write` records a new project's findings |

The course is served at `localhost:8080`, which the reader treats as an `http://`
course id, and course pages are client-rendered, so the browser fetches
`http://localhost:8080/tutors.json` directly. The release harness can run the
same journeys against a second stack by changing the URLs.
