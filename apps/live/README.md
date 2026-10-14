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
- `@tutors/svelte-state` for live presence tracking, over the `@tutors/domain` and `@tutors/application` rings
- `@tutors/realtime-supabase` and `@tutors/store-supabase` are the adapters `src/lib/compose.ts` puts behind the presence port and the health check
- `@tutors/app-config` for the shared Vite-based SvelteKit configuration (build time only)
- `@tutors/i18n` for interface text in the reader's six languages
- `@tutors/clock` for the server clock seam (`HARNESS_NOW`) and the `GET /version` endpoint
- Tailwind CSS v4 + Skeleton UI
