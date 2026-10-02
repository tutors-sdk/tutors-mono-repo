# Student data through the reader's server

Tutors signs people in with Auth.js, so Supabase never sees who is calling: every browser request
arrives as `anon`, with the key every page ships. Row-Level Security cannot tell one student from
another, and the policies `20260924_enable_rls_public_tables.sql` added let any row through. This
guide describes how that is being closed: writes, and reads of personal data, move to SvelteKit
server routes that check the Auth.js session and use a private `service_role` key. The contract
step that removes the old anon access ships in the next release, once no older pod or tab uses it
(see [Release order](#release-order)).

The behaviour is specified as EARS Rules in
[`tests/bdd/features/shared/server-data-access.feature`](../tests/bdd/features/shared/server-data-access.feature)
(Rules 0065 to 0075) and proved by `pnpm test:bdd`: the scenarios call the real route handlers and
the real browser services, with only the session, the database and the course host stood in.

## The data API: the seam

Browser packages no longer talk to the database for anything personal. They talk to a typed data
API: [`@tutors/data-api`](../packages/svelte/data-api/src/contract.ts) holds what each route takes
and returns, and the one client (`dataApi`) the community, connect, RBAC and whiteboard code call.
The server side implements that contract; nothing in a browser package knows which database is
behind it, so leaving Supabase changes this layer and the routes, and no browser package.

Two checks keep the seam honest:

- `no-database-client-in-browser-code` (`.dependency-cruiser.cjs`, run by `pnpm test:runway`):
  browser code may not import `@supabase/supabase-js`. The exceptions are the anon client factory
  used for Realtime channels and public reads (`packages/svelte/community/src/utils/supabase-client.ts`),
  server-only files, and type-only imports.
- `tests/architecture/browser-data-access.test.ts`: what browser code does with that anon client is
  limited to reading the public tables (`tutors-connect-courses`, `tutors-connect-latest`,
  `tutors_content_locks`), inserting into `app_errors`, and calling `get_student_count` and
  `get_error_counts`. Anything else belongs behind a route.

**The reader is the data API's host for now, and that is temporary.** The routes live in the reader
because it is the app with Auth.js. The time dashboard calling the reader for its data is the smell
that says so: on OpenShift the data API wants to be its own pod, with the reader, time and live
apps as clients (#325). Moving it is a deployment change, not a browser one, because of the
contract above.

## The routes

All in the reader for now, under `apps/reader/src/routes/api/`. The helpers they share are in
`apps/reader/src/lib/server/api/`.

| Route | Who may call it | What it does |
| --- | --- | --- |
| `POST /api/analytics` | a signed-in student | a page load (`kind: "page-load"`) or a 30-second tick (`kind: "tick"`): learning record and calendar row, under the session's login |
| `GET`, `PUT`, `PATCH /api/me` | a signed-in user | their own `tutors-connect-users` row: read sentiment and status; create or refresh on sign-in (name, email, avatar from the session); change sentiment or online status |
| `GET`, `PUT /api/profile` | a signed-in user | their own course-visit history in `tutors-connect-profiles` |
| `POST /api/courses/visit` | anyone viewing a course | counts a visit in the public catalogue; the course must be published, and its title, credits and privacy come from its tutors.json |
| `POST /api/presence` | a signed-in student who shares presence | the latest learning object in `tutors-connect-latest`; the user in the payload is replaced with the session's |
| `PUT`, `DELETE /api/locks` | an educator of the course | lock, unlock or remove a lock in `tutors_content_locks` |
| `GET`, `PUT /api/whiteboard` | reading a shared board: anyone; a personal board or saving: a signed-in user | a whiteboard learning object's saved scene; the owner of a personal room is appended by the server |
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

## Who may do what: one authorization module

Every decision goes through one question, `can(actor, action, resource)`, in
`apps/reader/src/lib/server/api/authorization.ts`. Actions are the RBAC permissions
(`content:lock`, `analytics:view`, ...) and a role's permissions come from the RBAC package's table
(`packages/svelte/utils/rbac/src/permissions.ts`), the same one the browser uses. A login's role in a
course is `educator` when the course's `enrollment.yaml` lists it under `educators` (read from the
course's published `tutors.json`) or when it is in `PRIVATE_TUTORS_ADMINS`; otherwise `student`.
Anything new that needs an authorization decision, the message bus included, asks `can()`; no
route decides for itself.

The course read is cached for five minutes. **If the course's host cannot be read** (network error,
timeout, 5xx, a broken tutors.json), the module does not guess:

- with a copy read within the last hour, it decides from that copy (Rule 0074), so a short Netlify
  outage does not stop educators; a removed educator keeps their rights for at most that hour while
  the host is down, and loses them at the first successful read after five minutes;
- without one, it says it cannot tell, and the route answers **503** "could not read who teaches
  this course", never a 403 that would claim the user is not an educator (Rule 0073).

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
classmates under pseudonyms with no name, avatar, sentiment or status, so the course medians still
work (Rule 0066). The pseudonyms are chosen to be **unlinkable**: a fresh random one per classmate
per answer, the same across the calendar and learning records of that answer, and different in the
next (Rule 0075). They follow neither row order nor alphabetical order, and a student cannot follow
"student-3" through a term to single a classmate out.

The live dashboard reads `tutors-connect-latest`, and the catalogue reads `tutors-connect-courses`
and the student count. These are public data: presence a student chose to share, and the course
list. The anon key keeps reading them. The catalogue's student count now comes from
`get_student_count()`, which returns only the number (Rule 0070).

## The key, and the debt it carries

`PRIVATE_SUPABASE_SERVICE_ROLE_KEY` bypasses Row-Level Security completely, so a leaked key is
worse than the situation this change closes.

**This is the first cut, and it is debt.** With service_role, Row-Level Security no longer applies
underneath the routes: every query scopes itself by hand (`.eq("student_id", login)` and the
like), and one missed filter is a full leak of that table. The scenarios for Rules 0071, 0072 and
0066 test the scoping that exists, but they cannot prove a filter nobody wrote. The way out is one
of:

- a least-privilege Postgres role for the data API, granted exactly the tables and columns the
  routes use, instead of service_role; or
- minting a short-lived Supabase JWT per request from the Auth.js session (`sub` = the GitHub
  login, plus a course role claim), so per-user RLS policies apply underneath and a missed filter
  returns nothing instead of everything.

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
   reader, and `PUBLIC_READER_URL` on time.
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
   migrations alone; until the harness's migration mode can restore a production copy and run the
   contract step there as a gate, this rehearsal is manual.
4. Move it into `supabase/migrations/` with a `-- contract-for: v<N>` header, delete its guard, and
   claim its drops. `pnpm check:migrations` refuses it until CHANGELOG.md records v<N> as released,
   so it cannot land in the same release as the routes that make it safe
   ([supabase/contracts/README.md](../supabase/contracts/README.md)).
5. Once it has run on production, old browser tabs must reload: their direct anon writes stop. Keep
   the patched pods during any rollback rather than restoring the public write policies.

Until step 5 has succeeded on production the exposure is **not** closed: the anon key can still
read and write the tables the old code used.

## Presence is the first message-bus candidate

Presence and the live dashboard are the one thing still on Supabase's proprietary transport
(Realtime broadcast channels, joined with the anon key). They are also where the weakest boundary
is: anyone can broadcast a forged `lo-event`. Moving presence to the platform's own message bus,
with publishers authenticated by the data API, fixes both, and is the natural first user of that
bus and of `can()`.

## Not closed by this change

- **Realtime broadcast channels** (presence, live) are still joined with the anon key, so anyone can
  send a fake `lo-event`. Nothing is stored from them any more; `tutors-connect-latest` is written
  only by `/api/presence`.
- **`app_errors`** still accepts inserts from anyone holding the anon key, so the table can be filled
  with junk, but it can no longer be read.
- **The time app's `POST /api/sync`** still has no authentication. It writes only what it fetches
  from Moodle, now with the service key.
- **Assignments and submissions** reach browsers only as counts, and only for educators, through
  `/api/time`.
