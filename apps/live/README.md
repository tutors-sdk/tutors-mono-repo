# Tutors Live

Activity across all Tutors courses, in three layers: **Now** (who is reading this minute), **Recent** (today and 7 days) and **Trend** (30 days).

## Features

- **Headline stats**: sessions, unique sessions, views, median and p90 session length, active courses, opted-in learners
- **Heat maps**: service usage by hour of day and day of week, service usage by day, course activity by day
- **Observations**: automatic cards for spikes, silent services, out-of-term activity and week-on-week drop-off
- **Live presence**: active sessions and what they are reading, pushed over SSE
- **Course drill-down**: per-course panels, top labs and topics, service mix
- Anonymous by design: no identity required, opt-in only for signed-in learners
- No authentication required to view

## Routes

- `/` - the dashboard: stat tiles, heat maps, top courses, observations
- `/course/[id]` - per-course drill-down
- `/[courseid]` - the older Supabase presence view for one course
- `/api/live/*` - the read API and the ingest endpoint (see below)

## The live API

| Endpoint | Returns |
|---|---|
| `POST /api/live/events` | accepts a batch of events from the reader and publishes them |
| `GET /api/live/now` | active sessions, per course, with the learning objects they are on |
| `GET /api/live/stream` | SSE of `now` snapshots |
| `GET /api/live/stats?range=today\|7d\|30d&course=` | headline stats, daily series, service mix, top courses |
| `GET /api/live/heatmap?kind=service\|service-monthly\|course&range=&course=` | a heat map matrix |
| `GET /api/live/observations?range=` | observation cards |
| `GET /api/live/courses` | the course filter options |

With no `LIVE_*` configuration the app runs the whole pipeline in memory - bus, presence and warehouse - so it is a working dashboard on its own. Point `LIVE_BUS`, `LIVE_HOT_STORE` and `LIVE_WAREHOUSE` at Redis, Valkey and TimescaleDB for the real thing, and the ingest consumer moves out to `services/live-ingest`.

The bus, the presence store, the warehouse and every number on the dashboard come from `@tutors/live-store`; the event contract and the reader's emitter are in `@tutors/live-events`.

Full design: [docs/LIVE-PIPELINE.md](../../docs/LIVE-PIPELINE.md).

## Development

```bash
npm run dev
```

Runs on http://localhost:5174

## Technology

- SvelteKit + Svelte 5
- `@tutors/ui` components
- `@tutors/course` for live presence tracking
- Tailwind CSS v4 + Skeleton UI
