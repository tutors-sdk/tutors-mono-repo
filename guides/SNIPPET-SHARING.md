# Ephemeral Snippet Sharing (Issue #155)

Tutors includes a lightweight **pastebin-style snippet sharing** feature. A signed-in student can share a code/output snippet with their course educators; the snippet is stored in Supabase and **auto-deletes after 48 hours**.

This is deliberately ephemeral — it is a "here's the error I'm hitting" tool for labs and talks, not a versioned collaborative editor.

## Goals

- Students sign in with GitHub and can share a snippet from the reader.
- On save, the course's educators receive a real-time toast.
- The educator dashboard in the time app shows the active snippets for that course.
- Every snippet expires after **48 hours**.
- The feature is fully disabled in **anonymous mode** (`PUBLIC_ANON_MODE=TRUE`).

## Why snippets are not GitHub gists

An earlier revision of this feature stored each snippet as a secret GitHub gist owned by the student. That was dropped before release, for three reasons:

- **Scope cost.** Creating a gist needs the `gist` OAuth scope, which is account-wide: it grants read, write and **delete** over *all* of the student's existing gists, not just the one Tutors creates. Every student would have to re-consent to that on next sign-in, to use a feature most of them never touch.
- **Token retention.** Deleting the gist at expiry meant storing the student's OAuth access token server-side for 48 hours, in a `course_gist_secrets` table. A snippet-sharing feature should not be a credential store.
- **Secret ≠ private.** A secret gist is only unguessable, not access-controlled. Anyone holding the URL can read it, and the URL was being broadcast over a channel students can join (see below).

Snippets now live in a single Supabase row. The scope stays at `read:user user:email`, no token is retained, and access is decided server-side.

## How It Works

```
Student (reader)                         Server (reader)                       Educator (time app)
─────────────────                        ───────────────                       ───────────────────
1. Clicks "Share snippet"
2. Fills in snippet
3. POST /api/gists ───────────────────►  4. Reads session (server only)
                                         5. Rate-limit + size checks
                                         6. INSERT course_gists (service key)
                                            content stored in the row
                                         7. Content-free `gist-created`
                                            ping on the course channel ────►  8. GistListener toasts
                                                                                 "New snippet shared"
                                                                              9. Educator opens /gists
                                                                             10. Server load re-checks
                                                                                 educator status, then
                                                                                 reads with service key
                                        11. (later, cron) Deletes expired rows
```

The realtime ping and the data path are deliberately separate. The ping says only *that* something was shared; the dashboard then fetches the actual snippets through an authorised server route.

### Auth

- The reader's GitHub provider requests `read:user user:email` only. Sharing a snippet needs no extra scope and no token is persisted.
- The **time app** now has its own Auth.js GitHub provider (`apps/time/src/hooks.server.ts`), because the educator check needs a verified identity. OAuth Apps permit a single callback URL, so this requires a **second GitHub OAuth App** pointing at the time app's `/auth/callback/github`.

### Authorisation — who counts as an educator

`apps/time/src/lib/server/educator.ts` is the gate. `requireEducator(event, courseId)`:

1. Reads the signed-in GitHub login from the session (server-side; no client input).
2. Fetches the published `tutors.json` for the course and reads `course.enrollment.educators` — the `educators:` list in the course's `enrollment.yaml`.
3. Allows the request only if the login appears in that list.

It **fails closed**: a course with no enrollment data grants access to nobody. Results are cached for 5 minutes per course.

> **The course PIN is not an authorisation mechanism.** `(calendar-lab)/+layout.ts` is a *universal* load, so `course.pin` is shipped to the browser and compared client-side; it is also bypassable by setting `sessionStorage["tutors-time-pin-verified-<courseid>"]`. It identifies nobody and must never gate snippet data. Other time-app pages still rely on it — that is a pre-existing issue, out of scope here.

### Create Flow — `POST /api/gists`

`apps/reader/src/routes/api/gists/+server.ts`:

1. **Rejects** anonymous mode, anonymous users, and oversized payloads (400 KB cap).
2. **Rate limits** to 3 snippets per student per course per rolling hour (abuse prevention — no toast spam).
3. Inserts a `course_gists` row with the snippet body, using the service-role key. `expires_at = now + 48h` is computed **server-side** and never client-supplied.
4. The client then fires the content-free `gist-created` ping.

### Educator Notification

- `packages/svelte/community/src/services/gist-broadcast.ts` is a dedicated student → educator realtime module (mirrors the #78 `broadcast.ts`). It keeps a single persistent per-course Supabase Realtime channel plus a same-browser `BroadcastChannel` relay, and guarantees **exactly-once delivery per tab**. It is wired to the anon client by `presence.svelte.ts` via `setGistSupabase` (anon mode leaves it inert).
- **The payload carries no snippet data.** Supabase broadcast rides the public anon key, so anyone — including any student — can join a course topic and read every message on it. The event is therefore only `{ type, id, courseId, sentAt }`: no student login or name, no title, no learning object, no body. `tests/contract/realtime/gist-created-protocol.contract.test.ts` asserts the exact field list against what the sender actually emits, so re-adding an identifying field fails CI.
- **Receiver** (time app): `GistListener.svelte` shows a content-free toast ("A student shared a snippet with this course") linking to the dashboard. It is mounted from `(calendar-lab)/+layout.svelte` and rendered only when the **server-side** `isEducator` check passed.

### Educator Dashboard

- `apps/time/src/routes/[courseid]/(calendar-lab)/gists/+page.svelte` + `GistsTable.svelte`.
- `+page.server.ts` calls `requireEducator` first. On denial it returns `{ authorised: false, reason }` with **no rows** — snippet data never reaches an unauthorised browser. The page renders an "Educators only" state instead.
- When authorised, it reads with the service key, filtering `expires_at > now()`, and enriches avatars from `tutors-connect-users`.
- Snippet bodies are rendered inline in an expandable row.
- **Live updates**: the page subscribes to the ping and calls `invalidateAll()`, which re-runs the authorised load.

### Expiry & Cleanup

Two layers guarantee the 48h cap:

1. **Read-time filtering** — the authorised read filters `expires_at > now()`, so an expired snippet is invisible well before physical deletion.
2. **Physical deletion** — the **`gist-cleanup.yml`** GitHub Actions workflow (cron, twice daily) runs `scripts/purge-course-gists.ts`, which batch-deletes expired rows. There is no GitHub call and no token, so there is no "orphaned on GitHub" failure mode.

   Dry-run locally: `DRY_RUN=1 pnpm tsx scripts/purge-course-gists.ts`.

## Security & Privacy

- **No extra OAuth scope** — sharing a snippet does not touch the student's GitHub content.
- **No token retention** — nothing credential-shaped is stored.
- **RLS** — `course_gists` has RLS enabled and **no policies at all**. It is closed to the anon role in both directions; the anon key ships in every client bundle, so an anon `SELECT` policy would make every snippet in every course world-readable. Reads and writes both go through server routes holding the service-role key. *Do not add an anon policy to this table.*
- **Authorisation** — reads are gated on `enrollment.yaml` educator membership, verified server-side, failing closed.
- **Realtime** — the broadcast channel is anon-readable by design, so it carries no snippet data (see above).
- **Abuse** — rate-limited to 3 per student per course per hour; 400 KB body cap.
- **Content** — students are warned not to paste secrets or credentials.

## Configuration

| Env var | Where | Purpose |
|---------|-------|---------|
| `PRIVATE_SUPABASE_SERVICE_KEY` | reader, time, cleanup job | Service-role key for the insert and the authorised read (never exposed to the browser). |
| `PRIVATE_AUTH_GITHUB_ID` / `PRIVATE_AUTH_GITHUB_SECRET` | reader, time | GitHub OAuth App credentials. The time app needs its **own** app (separate callback URL). |
| `PRIVATE_AUTH_SECRET` | reader, time | Auth.js session secret (32+ chars). |
| `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` | reader, time | Existing Supabase config; anon client used for realtime broadcast only. |
| `PUBLIC_ANON_MODE` | reader | When `"TRUE"` the whole feature is disabled and `POST /api/gists` returns 403. |

Each app reads its own `.env` from its own directory (Vite's `envDir` is the app root, not the repo root) — see `CONTRIBUTING.md` and issue #185.

## Data Model

See `supabase/migrations/20260905_create_course_gists.sql`. One table:

- **`course_gists`** — course id, student login/name, `filename`, `content`, optional title and learning-object labels, `created_at`, `expires_at`. RLS on, no policies.

## Open Notes

- The table is still named `course_gists` although nothing about it is a gist any more; renaming it to `course_snippets` is left as a follow-up so this change stays reviewable.
- The cleanup cadence (2×/day) is well inside the 48h cap, so a single failed run always has a retry window.
- The time app's educator sign-in requires a second GitHub OAuth App to be provisioned before this ships.
