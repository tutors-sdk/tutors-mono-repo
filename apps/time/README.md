# Tutors Time

Class activity for lecturers: how long students spend in a course, day by day, week by week and lab by lab.

## Features

- Open a course by URL, optionally for a date range, with an optional Moodle assignment sync
- Medians, calendar and lab views, a student drill-down, raw records and Moodle assignments
- Heatmaps and heat-tinted tables on the Paper tokens, shared with the reader's My time page
- Uses `TutorsShell` with its own Class activity sidebar
- A course PIN gate (`ignorepin` in the course's `tutors.json`)

## Routes

- `/` - Open a course
- `/[courseid]/medians` - Course medians (`/[courseid]` redirects here)
- `/[courseid]/calendar/byweek`, `/byday`, `/raw` - Calendar views
- `/[courseid]/lab/bylab`, `/bystep`, `/learning-records` - Lab views
- `/[courseid]/assignments` - Moodle assignments and submission counts
- `/[courseid]/[studentid]` - One student beside the course median

## Development

```bash
npm run dev
```

Runs on http://localhost:5176

## Technology

- SvelteKit + Svelte 5
- `@tutors/tutors-time-lib` for course time, calendar and lab models
- `@tutors/ui-navigators`, `@tutors/ui-components` and `@tutors/ui-primitives` for the shell, heatmaps, tables and icons
- `@tutors/themes` and `@tutors/i18n` for themes and interface text
- `@tutors/community` for Supabase access
- `@tutors/logger`, `@tutors/metrics` and `@tutors/runtime` for logs, `GET /metrics`, the server clock seam (`HARNESS_NOW`) and `GET /version`
- AG Grid, Heat.js, Tailwind CSS v4 + Skeleton UI
