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
| `PRIVATE_AUTH_GITHUB_ID`, `PRIVATE_AUTH_GITHUB_SECRET`, `PRIVATE_AUTH_SECRET` | GitHub sign-in (Auth.js) |
| `PUBLIC_PDF_KEY` | The Adobe PDF viewer for talks |
| `METRICS_TOKEN`, `LOG_LEVEL` | Guarding `/metrics` and the log level |

## Tests

The Playwright specs live in `tests/e2e/`. Run them from the root with `pnpm test:e2e:reader`. The config starts `pnpm dev` itself. Unit and BDD tests for the packages the reader uses are under the root `tests/`.

## Workspace packages

- `@tutors/ui-primitives`, `@tutors/ui-navigators`, `@tutors/ui-components` provide the interface
- `@tutors/course`, `@tutors/tutors-model-lib` load and model courses
- `@tutors/connect`, `@tutors/community`, `@tutors/rbac`, `@tutors/runes` handle sign-in, presence, roles and shared state
- `@tutors/themes`, `@tutors/i18n` provide themes and interface text
- `@tutors/tutors-create`, `@tutors/tutors-time-lib` support course creation and the time views
- `@tutors/logger`, `@tutors/metrics`, `@tutors/runtime` provide logging, `/metrics`, `/version` and the server clock seam
- `@tutors/app-config` provides the shared `vite.config.ts` and `svelte.config.js` (build time only)

[docs/COURSE-PAGE-WALKTHROUGH.md](../../docs/COURSE-PAGE-WALKTHROUGH.md) walks through how a course page is rendered.
