# E2E stack (runway tier G)

Named journeys run against the **built container images**, never `vite dev`,
with a fixture course server so GitHub and Netlify are not dependencies.

```bash
pnpm e2e:stack:fixture                 # scaffold + generate the fixture course (needs Deno)
docker compose up --build --no-start   # or build tutors/<app>:local however you like
pnpm e2e:stack:up                      # reader, catalogue, live, fixture servers
pnpm test:e2e:stack --project=chromium --project=webkit
pnpm test:e2e:stack --project=signed-in   # signed-in, resilience and authorisation journeys
pnpm test:e2e:stack:ratchet            # fail on stale baseline lines
pnpm e2e:stack:down
```

The shared Caddy proxy owns the public HTTP ports and supplies trusted origin headers to the private Kit 3 app services.

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
| `compose.yaml` | The stack: `proxy`, `reader`, `reader-unconfigured`, `catalogue`, `live`, `course`, `course-broken` |
| `journeys/journeys.ts` | The journeys, role and accessible-name selectors only, calling `onPage(key)` at each page |
| `journeys/student.journey.spec.ts` | Runs the journeys with axe and reduced-motion audits at every page |
| `journeys/negative.journey.spec.ts` | `test.fail()` journeys: prove a journey can fail, and pin known product bugs |
| `a11y-known-violations.txt`, `reduced-motion-known.txt` | Shrink-only baselines, keyed `<project> \| <page> :: <finding>` |
| `ratchet.mjs` | Stale-line check after a run; `--write` records a new project's findings |
| `fixture-course/build-signed-in.ts` | The signed-in course (the release harness's Rule journeys' course): private, an enrollment list, a quiz, a talk, a notebook, a calendar, a whiteboard, PIN 4321 |
| `fixtures/identity/` | The release harness's GitHub OAuth stub (HTTPS on 443, test CA in `certs/`); `POST /_harness/fault {"mode":"down"}` fails the token exchange; it also answers `https://harness-rules.netlify.app/tutors.json` from the signed-in course |
| `fixtures/persistence/` | The harness's Supabase REST and Realtime stub; `/_harness/reset`, `writes`, `seed`, `relay`, and `fault` (`down` answers 503, `hang` never answers) |
| `journeys/signed-in.ts` | Signing in per role through the stubs, paced under Better Auth's limit, and the stubs' control routes |
| `journeys/signed-in.journey.spec.ts` | `@journey` Rules 0606-0613 and 0635-0639 (tests/bdd/features/journeys/signed-in.feature) |
| `journeys/resilience.journey.spec.ts` | `@journey` Rules 0614-0617: a stalled course host, a data API down or hanging, GitHub failing sign-in |
| `journeys/authorisation.journey.spec.ts` | `@journey` Rule 0621: every route in `authorisation/matrix.json` asked as every role |
| `authorisation/matrix.json`, `authorisation/known-gaps.txt` | Tier F: the status each role gets from each route, and the cells that differ today (shrink-only) |

## The signed-in half

`compose.yaml` also runs the reader, Live and time apps signed in (`reader-signed-in`, `live-signed-in`,
`time-signed-in` behind `proxy-signed-in` on ports 3100, 3102 and 3104) against two stubs copied from the release
harness: `identity` impersonates github.com and api.github.com for the apps (compose `extra_hosts` and the test CA in
`NODE_EXTRA_CA_CERTS`), and `persistence` stands in for Supabase. The browser is routed to the identity stub by
Playwright (`contextFor` in `journeys/signed-in.ts`), signing in as `student`, `enrolled` or `lecturer`. The
`signed-in` project runs one test at a time, since the journeys share one persistence stub and reset it before each.

Locally, the browser must reach `persistence.e2e.test` without the machine's proxy:
`NO_PROXY=$NO_PROXY,.e2e.test`. The whiteboard journey (Rule 0639) loads Excalidraw from esm.sh, so it needs a
network that reaches it.

## The anonymous half

The course is served at `localhost:8080`, which the reader treats as an `http://`
course id, and course pages are client-rendered, so the browser fetches
`http://localhost:8080/tutors.json` directly. The release harness can run the
same journeys against a second stack by changing the URLs.
