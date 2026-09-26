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
npm run dev
```

Runs on http://localhost:5174

## Technology

- SvelteKit + Svelte 5
- `@tutors/ui` components
- `@tutors/course` for live presence tracking
- `@tutors/i18n` for interface text in the reader's six languages
- `@tutors/runtime` for the server clock seam (`HARNESS_NOW`) and the `GET /version` endpoint
- Tailwind CSS v4 + Skeleton UI
