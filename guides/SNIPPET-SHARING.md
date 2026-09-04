# Ephemeral Snippet Sharing (Issue #155)

Tutors includes a lightweight **pastebin-style snippet sharing** feature. A signed-in student can share a code/output snippet with their course lecturer; the gist is stored on GitHub (owned by the student's account) and **auto-deletes after 48 hours**.

This is deliberately ephemeral — it is a "here's the error I'm hitting" tool for labs and talks, not a versioned collaborative editor.

## Goals

- Students sign in with GitHub and can create a snippet from the reader.
- On save, the course lecturer receives a real-time toast with a "View gist" action.
- The lecturer dashboard shows a live list of active snippets for that course.
- Every snippet expires after **48 hours** (gist deleted on GitHub + metadata purged).
- The feature is fully disabled in **anonymous mode** (`PUBLIC_ANON_MODE=TRUE`).

## How It Works

```
Student (reader)                         Server (reader)                       Lecturer (time app)
─────────────────                        ───────────────                       ───────────────────
1. Clicks "Share snippet"
2. Fills in snippet
3. POST /api/gists ───────────────────►  4. Reads session JWT (server only)
                                         5. Creates SECRET gist on GitHub
                                            using the student's OAuth
                                            token (`gist` scope)
                                         6. INSERT course_gists (service key)
                                         7. INSERT course_gist_secrets (token)
                                         8. Broadcast `gist-created`
                                            on the course channel ─────────►  9. GistListener fires
                                                                                   a toast ("View gist")
                                                                                   10. GistsTable appends row
                                         11. (later, cron) Purges expired rows
                                             + deletes the GitHub gist
```

### Auth & Token (Phase 1)

- The GitHub provider now requests the `gist` scope in addition to `read:user user:email` (`apps/reader/src/hooks.server.ts`). **Existing users re-consent on next sign-in.**
- On sign-in the GitHub OAuth **access token** is captured onto the session JWT (`jwt` callback). It is **never** returned to the browser (the `session` callback deliberately omits it).
- Server code reads it with the sanctioned `@auth/core/jwt` `getToken()` helper (`apps/reader/src/lib/auth.ts`) and uses it **only** to create the gist.
- After creation the token is stored in `course_gist_secrets` (closed to anonymous clients) **only** so the expiry job can `DELETE` the gist on GitHub later.

### Create Flow (Phase 3) — `POST /api/gists`

`apps/reader/src/routes/api/gists/+server.ts`:

1. **Rejects** anonymous mode, anonymous users, and oversized payloads (400 KB cap).
2. **Rate limits** to 3 gists per student per course per rolling hour (abuse prevention — no toast spam).
3. Creates a **secret** gist via the GitHub API.
4. Inserts a `course_gists` row (server-computed `expires_at = now + 48h` — the cap is enforced server-side and never client-supplied).
5. Stores the token in `course_gist_secrets` (CASCADE on the row id).
6. Broadcasts `gist-created` on the course's realtime channel.
7. If any later step fails, it **best-effort deletes** the GitHub gist so nothing is left dangling.

### Lecturer Notification (Phase 4)

- `apps/time/src/lib/components/GistListener.svelte` subscribes to the course channel for `gist-created` and shows a toast with a **"View gist"** action (reusing the existing Skeleton toast scaffolding).
- It is mounted in `apps/time/src/routes/[courseid]/+layout.svelte`, so it only runs **after the PIN gate** — i.e. only the lecturers who know the course PIN are toasted, not every student.

### Lecturer Dashboard (Phase 5)

- `apps/time/src/routes/[courseid]/(calendar-lab)/gists/+page.svelte` (PIN-gated) + `apps/time/src/lib/components/tables/GistsTable.svelte`.
- Lists **active** snippets for the course (read path filters `expires_at > now()`), with student (avatar + name), title, learning object, "shared" time, **time remaining**, and a "View gist" link.
- **Live updates**: subscribes to the same channel and prepends new snippets as they arrive.

### Expiry & Cleanup (Phase 6)

Two layers guarantee the 48h cap:

1. **Read-time filtering** — the dashboard and RLS both filter `expires_at > now()`, so an expired snippet is invisible even before physical deletion.
2. **Physical deletion** — the **`gist-cleanup.yml`** GitHub Actions workflow (cron, twice daily) runs `scripts/purge-course-gists.ts`, which for every expired row:
   - `DELETE`s the GitHub gist using the student's stored token (best-effort), then
   - removes the `course_gists` row — which **cascades** to remove `course_gist_secrets`.
   - If the token has been revoked, the gist delete fails but the row is still purged so it stops surfacing (documented best-effort limitation).

   Dry-run locally: `DRY_RUN=1 pnpm tsx scripts/purge-course-gists.ts`.

## Security & Privacy

- **Broader OAuth scope** — `gist` lets Tutors create/delete gists on the student's behalf. Requires explicit consent; prefer *secret* gists (they are).
- **Token handling** — the GitHub token is stored server-side only, never sent to the browser, and only used to create the gist and delete it later.
- **RLS** — `course_gists` is read-only for anonymous clients (active rows only); `course_gist_secrets` has no anonymous policy at all. Writes require a service-role key.
- **Abuse** — rate-limited per student per course per hour.
- **Content** — secret gists are not truly private (URL is unguessable but shareable). Students are warned not to paste secrets/credentials.

## Configuration

| Env var | Where | Purpose |
|---------|-------|---------|
| `PRIVATE_SUPABASE_SERVICE_KEY` | reader, cleanup job | Service-role key for authenticated insert/delete (never exposed to the browser). |
| `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` | reader, time | Existing Supabase config; anon client used for reads + realtime broadcast. |
| `PUBLIC_ANON_MODE` | reader | When `"TRUE"` the whole feature is disabled and `POST /api/gists` returns 403. |

## Data Model

See `supabase/migrations/20260905_create_course_gists.sql`. Two tables:

- **`course_gists`** — public metadata (read-only for anonymous; auto-hidden once expired).
- **`course_gist_secrets`** — the GitHub access token (no anonymous policy; CASCADE to the gist row).

## Open Notes

- The token is scoped to the **current** gist for deletion; if the student revokes the `gist` scope after 48h the cleanup job still removes the metadata (documented best-effort).
- The cleanup cadence (2×/day) is well inside the 48h cap, so a single failed run always has a retry window.
