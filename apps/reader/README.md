# Tutors Reader

The reader is the course viewer behind [tutors.dev](https://tutors.dev). It loads a published course's `tutors.json` and renders its topics, labs, talks, notes and other learning objects. It also has GitHub sign-in, live presence, time tracking and a course creation wizard. Sign-in, presence and analytics are off in anon mode.

## Running it

From the repository root:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` builds `ui-primitives`, `ui-navigators` and `ui-components` first, then starts the reader on http://localhost:5173. Open http://localhost:5173/course/reference-course to see a course. Any published course id works in that URL.

The `.env` file sits at the repository root, not in this folder. With `PUBLIC_ANON_MODE=TRUE` (the default in `.env.example`) no backend is needed, so sign-in, presence and analytics are off.

## Environment

| Variable | Used for |
|---|---|
| `PUBLIC_ANON_MODE` | `TRUE` turns off auth, presence and analytics |
| `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY` | Learning records and presence |
| `PRIVATE_AUTH_GITHUB_ID`, `PRIVATE_AUTH_GITHUB_SECRET`, `PRIVATE_AUTH_SECRET` | GitHub sign-in (Better Auth) |
| `PUBLIC_PDF_KEY` | The Adobe PDF viewer for talks |
| `METRICS_TOKEN`, `LOG_LEVEL` | Guarding `/metrics` and the log level |

## Tests

The Playwright specs live in `tests/e2e/`. Run them from the root with `pnpm test:e2e:reader`. The config starts an isolated `pnpm dev` itself with authentication enabled, fixture OAuth credentials, and Supabase directed to a local discard fixture; it never reuses your running dev server. Ports 5173, 5178 and 5179 must be free.

`signInAs` obtains signed session cookies through the real `/auth` routes and installs them in the browser. The server's GitHub fetches use the same provider responses as `tests/bdd/support/reader-auth.ts`, via a test-only Node preload that refuses production mode or different credentials. Lecturer role comes from intercepted course enrollment, not a client role override. Store seeding remains for rendering/presence previews and the explicit forged-identity regression.

`authentication.spec.ts` covers the real sign-in button, navigation, reload, UI logout, forged identity/cookies and rejection under a different production secret. Its protected route lives in an unshipped SvelteKit fixture that runs the reader's actual hooks. It tests session resolution; replace it with #320's personal-data route when that lands to cover that route's access policy. Unit and BDD tests for the packages the reader uses are under the root `tests/`.

## Workspace packages

- `@tutors/ui-primitives`, `@tutors/ui-navigators`, `@tutors/ui-components` provide the interface
- `@tutors/course`, `@tutors/tutors-model-lib` load and model courses
- `@tutors/identity`, `@tutors/identity-sveltekit` provide verified identity contracts and the Better Auth adapter
- `@tutors/connect`, `@tutors/community`, `@tutors/rbac`, `@tutors/runes` handle sign-in, presence, roles and shared state
- `@tutors/themes`, `@tutors/i18n` provide themes and interface text
- `@tutors/tutors-create`, `@tutors/tutors-time-lib` support course creation and the time views
- `@tutors/logger`, `@tutors/metrics`, `@tutors/runtime` provide logging, `/metrics`, `/version` and the server clock seam
- `@tutors/app-config` provides the shared Vite-based SvelteKit configuration (build time only)

[docs/COURSE-PAGE-WALKTHROUGH.md](../../docs/COURSE-PAGE-WALKTHROUGH.md) walks through how a course page is rendered.
