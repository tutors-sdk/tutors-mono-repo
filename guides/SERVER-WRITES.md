# Student data through the reader's server

Tutors signs people in with Auth.js, so Supabase never sees who is calling: every browser request
arrives as `anon`, with the key every page ships. Row-Level Security cannot tell one student from
another, and the policies `20260924_enable_rls_public_tables.sql` added let any row through. This
guide describes how that is being closed: writes, and reads of personal data, move to SvelteKit
server routes that check the Auth.js session and use a private `service_role` key. The contract
migration in this release removes the old anon access after the new pods are serving traffic.

The behaviour is specified as EARS Rules in
[`tests/bdd/features/shared/server-data-access.feature`](../tests/bdd/features/shared/server-data-access.feature)
(Rules 0065 to 0072) and proved by `pnpm test:bdd`: the scenarios call the real route handlers and
the real browser services, with only the session, the database and the course host stood in.

## The routes

All in the reader, under `apps/reader/src/routes/api/`. The helpers they share are in
`apps/reader/src/lib/server/api/`.

| Route | Who may call it | What it does |
| --- | --- | --- |
| `POST /api/analytics` | a signed-in student | a page load (`kind: "page-load"`) or a 30-second tick (`kind: "tick"`): learning record and calendar row, under the session's login |
| `GET`, `PUT`, `PATCH /api/me` | a signed-in user | their own `tutors-connect-users` row: read sentiment and status; create or refresh on sign-in (name, email, avatar from the session); change sentiment or online status |
| `GET`, `PUT /api/profile` | a signed-in user | their own course-visit history in `tutors-connect-profiles` |
| `POST /api/courses/visit` | anyone viewing a course | counts a visit in the public catalogue; the course must be published, and its title, credits and privacy come from its tutors.json |
| `POST /api/presence` | a signed-in student who shares presence | the latest learning object in `tutors-connect-latest`; the user in the payload is replaced with the session's |
| `PUT`, `DELETE /api/locks` | an educator of the course | lock, unlock or remove a lock in `tutors_content_locks` |
| `GET`, `PUT /api/whiteboard` | reading a shared board: anyone; a personal board or saving: a signed-in user | a whiteboard learning object's saved scene; personal rooms have a separate namespace derived from the session |
| `GET /api/time/[courseId]` | a signed-in user; the time dashboard's origin with the reader's cookie | a course's time rows: all of them for an educator, otherwise the viewer's own and classmates pseudonymised |

Common to every route:

- **Identity comes from the session**, never from the body. A request that names another student is
  stored under the caller's own login (Rule 0072). No session: 401 before any row is read (Rule 0071).
- **Writes accept only `application/json`.** A cross-site page cannot send that without a CORS
  preflight, and the write routes answer none, so only the reader's own pages can write. SvelteKit's
  own origin check turns away cross-site form posts (`tests/security/mutating-routes.txt`).
- **Input is checked** (`validate.ts`): course ids, routes, sentiments, calendar days (the browser's
  local day, within a day of the server's), body sizes.
- **503 without a key.** When `PRIVATE_SUPABASE_SERVICE_ROLE_KEY` is not set (local development,
  anonymous mode) the routes answer 503 and the browser carries on without saving.

## Who is an educator

The server decides, for locks and time data, from the same source the browser's RBAC uses
([RBAC.md](RBAC.md)): a GitHub login listed under `educators` in the course's `enrollment.yaml`,
read from the course's published `tutors.json` (`course-access.ts`, cached for five minutes).
Logins in `PRIVATE_TUTORS_ADMINS` count as educators of every course.

A course with no `enrollment.yaml` has no educators, so nobody sees its students' time by name
until one is added. The server fetches tutors.json only from `https://<id>.netlify.app` or a host in
`PRIVATE_COURSE_HOSTS`, never from a URL in a request.

## The time and live dashboards

The time dashboard (`apps/time`) has no sign-in and no database key for reading. It reads each
course from the reader's `GET /api/time/<courseId>` with `credentials: "include"`
(`apps/time/src/lib/time-source.ts`, `readerTimeSource` in `packages/jsr/time`). The reader's
session cookie is `SameSite=Lax` and host-only; the browser sends it because the time app and the
reader are the same site (`*.tutors.dev`). Two settings make that work:

- the time app's `PUBLIC_READER_URL` must be the host people sign in to the reader at;
- the reader lists the time app's origin in `PRIVATE_API_ALLOWED_ORIGINS`, which is the only origin
  that gets CORS headers. A request from any other origin is refused before the database is touched.

A viewer who is not signed in to the reader gets a link to its sign-in page instead of data (the
calendar and lab layout; no Rule covers this yet, since the time app has no browser tests).

The reader's own "My time" page uses the same route. A student there sees their own rows, and their
classmates as `student-1`, `student-2`, ... with no name, avatar, sentiment or status, so the course
medians still work (Rule 0066).

The live dashboard reads `tutors-connect-latest`, and the catalogue reads `tutors-connect-courses`
and the student count. These are public data: presence a student chose to share, and the course
list. The anon key keeps reading them. The catalogue's student count now comes from
`get_student_count()`, which returns only the number (Rule 0070).

## The key

`PRIVATE_SUPABASE_SERVICE_ROLE_KEY` bypasses Row-Level Security completely, so a leaked key is
worse than the situation this change closes.

- It is read only from `$env/dynamic/private`, in `apps/reader/src/lib/server/api/service-client.ts`
  and the time app's `$lib/server/db/submissionsRepository.ts`. SvelteKit refuses to bundle
  `$lib/server` modules for the browser.
- It is never a `PUBLIC_` variable, never in a ConfigMap. In Kubernetes it goes in the reader's
  `reader-tutors-app-oauth` Secret and the time app's `time-tutors-app-secrets` Secret (see the
  `secrets.yaml.example` files).
- If it equals the anon key, the reader logs an error and does not use it (the routes answer 503).

## Release order

**Release N (the one that ships this change): expand.**

1. Set `PRIVATE_SUPABASE_SERVICE_ROLE_KEY` on reader and time, `PRIVATE_API_ALLOWED_ORIGINS` on
   reader, `PUBLIC_READER_URL` on time, and `PRIVATE_MOODLE_SYNC_TOKEN` on time.
2. Apply the pending migrations (`20260925100000` to `20260925100200`) as usual, then deploy the new
   reader and time pods. Everything in `supabase/migrations` is safe to run before the new pods are
   up: nothing there removes what a v16.2.2 pod or tab uses.

**Release N+1: contract.** `supabase/contracts/revoke_anon_student_data.sql` removes the anon
policies and table grants for personal data and writes, and revokes anon access to the two
student-counter RPCs (public catalogue, shared presence and lock reads remain). It is not a
migration yet, so no release run or `supabase db push` can apply it early, and it refuses to run
unless `tutors.contract_ok` is set. In the release after N:

3. Rehearse it against a copy of production (`SET tutors.contract_ok = 'on';` then the file). The
   protected tables predate `supabase/migrations`, so the release harness cannot recreate them from
   migrations alone.
4. Move it into `supabase/migrations/` with a `-- contract-for: v<N>` header, delete its guard, and
   claim its drops. `pnpm check:migrations` refuses it until CHANGELOG.md records v<N> as released,
   so it cannot land in the same release as the routes that make it safe
   ([supabase/contracts/README.md](../supabase/contracts/README.md)).
5. Once it has run on production, old browser tabs must reload: their direct anon writes stop. Keep
   the patched pods during any rollback rather than restoring the public write policies.

Until step 5 has succeeded on production the exposure is **not** closed: the anon key can still
read and write the tables the old code used.

Moodle sync is operator-only. Call the time app's `POST /api/sync` with
`Authorization: Bearer <PRIVATE_MOODLE_SYNC_TOKEN>`; the dashboard no longer offers a browser sync
control because it has no sign-in of its own.

## Not closed by this change

- **Realtime broadcast channels** (presence, live) are still joined with the anon key, so anyone can
  send a fake `lo-event`. Nothing is stored from them any more; `tutors-connect-latest` is written
  only by `/api/presence`.
- **`app_errors`** still accepts inserts from anyone holding the anon key, so the table can be filled
  with junk, but it can no longer be read.
- **Assignments and submissions** reach browsers only as counts, and only for educators, through
  `/api/time`.
