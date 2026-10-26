# Tutors Live

Real-time student activity tracking across all Tutors courses.

## Features

- **Live Dashboard**: View courses and students currently online
- **Course Activity**: Track activity for specific courses by time period (today, week, month, year)
- Uses `TutorsShell` for consistent navigation
- No authentication required

## Routes

- `/` - Live activity dashboard (Courses/Students/Groups tabs)
- `/[courseid]` - Course-specific activity tracking

## Development

```bash
pnpm --filter tutors-live dev
```

Runs on http://localhost:5174

## Technology

- SvelteKit + Svelte 5
- `@tutors/ui-components`, `@tutors/ui-navigators` and `@tutors/ui-primitives` components
- `@tutors/community` for live presence tracking
- `@tutors/course` for loading a course on its `/[courseid]` page
- `@tutors/app-config` for the shared Vite-based SvelteKit configuration (build time only)
- `@tutors/i18n` for interface text in the reader's six languages
- `@tutors/runtime` for the server clock seam (`HARNESS_NOW`) and the `GET /version` endpoint
- Tailwind CSS v4 + Skeleton UI
