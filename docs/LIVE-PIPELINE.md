# Tutors Live: stats and heat maps

How the live dashboard gets its numbers, from a click in the reader to a cell in a heat map.

The dashboard has three layers: **Now** (who is reading this minute), **Recent** (today and the last 7 days) and **Trend** (30 days). Each has a different source, and that is the main thing to hold on to when reading the code.

## The shape of it

```
reader (browser)
  │  POST /api/live/events        batched, beacon on page hide
  ▼
apps/live  /api/live/events  ──publish──▶  bus  ──▶  ingest consumer
  │                                                    │
  │                                          ┌─────────┴─────────┐
  │                                          ▼                   ▼
  │                                   presence store        warehouse
  │                                   (Valkey)              (TimescaleDB)
  │                                          │                   │
  └──── /api/live/now, /stream ◀─────────────┘                   │
  └──── /api/live/stats, /heatmap, /observations ◀───────────────┘
```

Three seams, each with a memory implementation and a networked one:

| Seam | Memory | Networked | Variable |
|---|---|---|---|
| Bus | in-process fan-out | Redis Streams | `LIVE_BUS` |
| Presence | a `Map` inside the window | Valkey sorted sets | `LIVE_HOT_STORE` |
| Warehouse | events rolled up on read | TimescaleDB | `LIVE_WAREHOUSE` |

Everything defaults to memory, so `docker compose up live` is a complete, working pipeline with no broker and no database: the app publishes to an in-process bus and consumes from it in the same process. With `LIVE_BUS=redis` the consumer becomes `services/live-ingest` and the app only reads.

## Privacy, which is a design constraint rather than a footnote

- A session is identified by `sid`: a random token regenerated every local day, never derived from an identity. Two days of activity by the same person cannot be joined, and "unique sessions" means "distinct tokens today".
- `uid` appears only on `session.started`, only for a signed-in learner who has opted in, and only as a salted SHA-256 of the login. Opting out purges it from stored events and sessions.
- Timestamps are coarsened to the minute before storage. Presence keeps full precision, because a 2-minute window cannot be judged from a minute-resolution clock, and presence is never stored.
- No IP addresses. No cookies beyond the daily token in `localStorage`.
- Raw events are retained 90 days; the aggregates outlive them.

The reader emits live events in anonymous mode too. That is the point: the dashboard counts everybody and knows who nobody is.

## Events

Published on `tutors.live.<type>`; the contract is `@tutors/live-events`.

| Event | When |
|---|---|
| `session.started` | the first course opened in a session |
| `course.opened` | a course page opened |
| `lo.viewed` | a learning object opened |
| `service.used` | a catalogued service exercised (derived from the learning object's type) |
| `session.heartbeat` | every 60 seconds while the page is visible |
| `session.ended` | page hide, or an idle gap longer than 30 minutes |

A browser cannot speak to a broker, so the emitter batches events and posts them to `/api/live/events`, which is the only thing that publishes. That endpoint is anonymous and unauthenticated by design, which makes validation the only control: unknown fields are dropped, every string is length-bounded, the batch is capped at 50 events and the body at 64KB, and a malformed event is rejected with a reason rather than repaired.

## Storage

Two rollups and a table, which is one more than the first sketch had, for a reason worth keeping:

- `live_hourly` - views and service touches per hour, course, service and learning object type. A TimescaleDB continuous aggregate. Summable along every axis, so the heat maps and the time series read it.
- `live_hourly_sessions` - distinct sessions per hour per course. A plain view, because TimescaleDB cannot materialise `count(distinct ...)`, and because a distinct count cannot be summed across the rows of `live_hourly` without over-counting sessions several times over.
- `live_sessions` - one row per completed session. The exact source for session counts, unique sessions and the median and p90 durations.

Sessions still open do not appear in `live_sessions` until the consumer's sweeper closes them, so the last 30 minutes of session counts lag. That window is exactly what the Now layer covers.

## Reading it

| Endpoint | Returns | Cached |
|---|---|---|
| `GET /api/live/now` | global active, per-course active with the learning objects they are on, services now | 2s |
| `GET /api/live/stream` | SSE of `now` snapshots, driven by the bus and coalesced to one per second | - |
| `GET /api/live/stats?range=today\|7d\|30d&course=` | headline stats, daily series, service mix, top courses, and top learning objects when a course is selected | 30s |
| `GET /api/live/heatmap?kind=service\|service-monthly\|course&range=&course=` | `{ x, y, cells, max, scale, unit }` | 5min |
| `GET /api/live/activity?range=&course=` | per-course last seen, sessions, visitors, returning rate, median and total time, plus the repeat-visit histogram | 30s |
| `GET /api/live/observations?range=` | observation cards | 5min |
| `GET /api/live/courses` | the course filter's options | 5min |

Heat maps bucket in local time: "Tuesday at 14:00" means the hour the learner was in.

### What "visitor" and "came back" mean

`/api/live/now` lists one row per open session, and `/api/live/activity` counts visitors. Both are bounded by the token rotating every night, so the words are used precisely:

- **Session handle** - six hex characters derived from the day's token, not the token. It distinguishes rows on a page and means nothing tomorrow. The token itself is never sent to a browser.
- **Visitor** - a distinct token-day. Two visits on one day are one visitor; the same person on two days is two, and nothing can tell that they were the same person.
- **Came back** - the share of sessions belonging to a token that opened the course more than once *on the same day*. It is the only repeat-visit number this model can produce, and the UI says so under the table rather than leaving the heading to imply more.

Answering "how many times has this learner logged in this week" would mean a token that survives the night, which is the one guarantee the design is built around. If that trade is ever wanted, it is a change to section 10 and to the footer, not a new query.

## Observations

Four rules, each a pure function over rollup rows so it can be fired on synthetic data rather than waited for:

| Rule | Fires when |
|---|---|
| Spike | a course's sessions today beat 3x its median over the last four same weekdays |
| Silent service | a catalogued service has no touches in the window |
| Out of term | activity above threshold on days outside the configured term windows (`LIVE_TERMS`) |
| Drop-off | a course loses more than 60% of its sessions week on week |

## Configuration

See the `PUBLIC_LIVE_EVENTS_URL` and `LIVE_*` block in [.env.example](../.env.example). With `PUBLIC_LIVE_EVENTS_URL` unset the reader's emitter is disabled and nothing changes for an existing deployment.

## Where the code is

| What | Where |
|---|---|
| Event contract, catalogue, session token, browser emitter | `packages/svelte/utils/live-events` |
| Bus, presence store, warehouse, metrics, heat maps, rules, ingest | `packages/svelte/utils/live-store` |
| Reader wiring | `packages/svelte/connect/src/services/live-events.ts` |
| Read API and dashboard | `apps/live` |
| Standalone consumer | [services/live-ingest](../services/live-ingest/README.md) |
| Tests | `tests/unit/live`, `tests/unit/connect/live-events-wiring.test.ts` |
