# Student data through the reader's server

Tutors signs people in with Auth.js, so Supabase never sees who is calling: every browser request
arrives as `anon`, with the key every page ships. Row-Level Security cannot tell one student from
another, and the policies `20260924_enable_rls_public_tables.sql` added let any row through. This
guide describes how that is being closed: writes, and reads of personal data, move to SvelteKit
server routes that check the Auth.js session and use a private `service_role` key. It is an
expand/contract change ([MIGRATIONS.md](MIGRATIONS.md)) spread over two releases.

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

## Release plan

### Release N (this change): expand

- Migrations: `whiteboard_scenes` (RLS on, no anon policy), `app_errors` closed to anon reads,
  `get_error_counts` runs as its owner, `get_student_count()` added. The `app_errors` policy drop is a
  claimed contract step: the table had never reached production.
- Code: every write and every personal read in the reader, the community and connect packages, the
  RBAC lock store, the whiteboard and the time dashboard goes through the routes above. The time
  app's Moodle sync writes with the service key.
- **The anon policies on the other tables stay.** While the release rolls out, pods of the previous
  release, and browser tabs opened before it, still write as anon. Removing the policies now would
  stop them saving learning records, sign-in and presence.
- Deploy: set `PRIVATE_SUPABASE_SERVICE_ROLE_KEY` (reader and time), `PRIVATE_API_ALLOWED_ORIGINS`
  (reader) and `PUBLIC_READER_URL` (time) before rolling out. Without the key, saving answers 503.
- Apply the three new migrations to production, in name order, before the new pods take traffic.

### Release N+1: contract

Once no deployed version writes as anon (release N is the one in production, and the previous
release's tag has been checked, not only `main`), remove the anon policies. Draft of the migration:
it is **not** in `supabase/migrations` yet, so the harness and `pnpm check:migrations` cannot
mistake it for part of release N.

```sql
-- supabase/migrations/<N+1 date>_revoke_anon_student_data.sql
-- Contract step of guides/SERVER-WRITES.md. Every write and personal read goes through the
-- reader's server since release N; no deployed version uses these policies.
DROP POLICY IF EXISTS anon_select ON public."tutors-connect-users";
DROP POLICY IF EXISTS anon_insert ON public."tutors-connect-users";
DROP POLICY IF EXISTS anon_update ON public."tutors-connect-users";
DROP POLICY IF EXISTS anon_select ON public."tutors-connect-profiles";
DROP POLICY IF EXISTS anon_insert ON public."tutors-connect-profiles";
DROP POLICY IF EXISTS anon_update ON public."tutors-connect-profiles";
DROP POLICY IF EXISTS anon_insert ON public."tutors-connect-latest";   -- anon_select stays: live dashboard
DROP POLICY IF EXISTS anon_update ON public."tutors-connect-latest";
DROP POLICY IF EXISTS anon_insert ON public."tutors-connect-courses";  -- anon_select stays: catalogue
DROP POLICY IF EXISTS anon_update ON public."tutors-connect-courses";
DROP POLICY IF EXISTS anon_delete ON public."tutors-connect-courses";
DROP POLICY IF EXISTS anon_select ON public.learning_records;
DROP POLICY IF EXISTS anon_insert ON public.learning_records;
DROP POLICY IF EXISTS anon_update ON public.learning_records;
DROP POLICY IF EXISTS anon_select ON public.calendar;
DROP POLICY IF EXISTS anon_insert ON public.calendar;
DROP POLICY IF EXISTS anon_update ON public.calendar;
DROP POLICY IF EXISTS anon_select ON public.assignments;
DROP POLICY IF EXISTS anon_insert ON public.assignments;
DROP POLICY IF EXISTS anon_update ON public.assignments;
DROP POLICY IF EXISTS anon_select ON public.assignments_submissions;
DROP POLICY IF EXISTS anon_insert ON public.assignments_submissions;
DROP POLICY IF EXISTS anon_update ON public.assignments_submissions;
DROP POLICY IF EXISTS content_locks_insert ON public.tutors_content_locks;  -- content_locks_select stays
DROP POLICY IF EXISTS content_locks_update ON public.tutors_content_locks;
DROP POLICY IF EXISTS content_locks_delete ON public.tutors_content_locks;
-- The two counters the browser used to call. Confirm their exact signatures on production first
-- (\df get_count_learning_records, \df increment_calendar); a SECURITY DEFINER one would otherwise
-- keep letting anon change any student's counts.
REVOKE EXECUTE ON FUNCTION public.get_count_learning_records(text, text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_calendar(text, text, text, text) FROM anon, PUBLIC;
```

The release that ships it claims each dropped policy in `release/claims.yaml` (`artefact: migration`,
scope `tutors-connect-users:anon_select` and so on, or a glob such as `learning_records:anon_*`), and
records the same findings in `tests/conformance/shipped-contract-migrations.txt`.
The tables other than `app_errors` and `whiteboard_scenes` are not created by
`supabase/migrations` yet, so the harness cannot rehearse this file against them (see MIGRATIONS.md,
"What is not in this directory yet"). Apply it to a copy of production first.

## Not closed by this change

- **Realtime broadcast channels** (presence, live) are still joined with the anon key, so anyone can
  send a fake `lo-event`. Nothing is stored from them any more; `tutors-connect-latest` is written
  only by `/api/presence`.
- **`app_errors`** still accepts inserts from anyone holding the anon key, so the table can be filled
  with junk, but it can no longer be read.
- **The time app's `POST /api/sync`** still has no authentication. It writes only what it fetches
  from Moodle, now with the service key.
- **Assignments and submissions** reach browsers only as counts, and only for educators, through
  `/api/time`. Their anon policies go in release N+1.
