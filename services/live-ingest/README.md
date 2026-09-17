# @tutors/live-ingest

Consumes `tutors.live.*` off the message bus and writes it to the presence store and the warehouse.

It is the same `createIngestor` the live app runs in-process on the memory bus, so there is one implementation of what an event means. This service exists for the deployment where the bus is real and the app should not be doing consumer work in a request path.

## What it does

- Subscribes to the bus (Redis Streams today; the adapter seam is where NATS would land).
- Writes presence into Valkey at full timestamp precision - the hot store has to tell a heartbeat 30 seconds ago from one 3 minutes ago.
- Writes raw events into TimescaleDB with timestamps coarsened to the minute.
- Closes sessions that have gone idle for 30 minutes, because a closed laptop never sends `session.ended`.
- Serves `/healthz`, `/healthz/live` and `/metrics` on `PORT` (3010 by default).

## Running it

```bash
# against the local pipeline from the repo root
docker compose --profile live-pipeline up --build

# or directly, against a Valkey and a TimescaleDB you already have
LIVE_BUS=redis LIVE_HOT_STORE=valkey LIVE_WAREHOUSE=postgres \
LIVE_REDIS_URL=redis://localhost:6379 \
LIVE_DATABASE_URL=postgres://tutors:tutors@localhost:5432/tutorslive \
pnpm --filter @tutors/live-ingest dev
```

With `LIVE_BUS=memory` (the default) this service has nothing to consume: those events never leave the app process. It says so on startup rather than sitting silently idle.

Configuration is the same set of `LIVE_*` variables the live app reads; see `.env.example`.

## Schema

The TimescaleDB schema is applied on every start and is idempotent. It lives in `@tutors/live-store` (`src/warehouse/schema.ts`) rather than in a `.sql` file, so it survives bundling into the runtime image.
