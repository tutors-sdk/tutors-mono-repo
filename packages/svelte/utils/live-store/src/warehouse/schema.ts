/**
 * The TimescaleDB schema, as a string rather than a `.sql` file so that it
 * survives bundling: the read API runs inside SvelteKit's adapter-node output,
 * where reading a file out of node_modules is not a given.
 *
 * Running it is idempotent, so `migrate()` can run on every ingest start.
 */
export const LIVE_SCHEMA_SQL = `
create extension if not exists timescaledb;

-- Raw events. Timestamps arrive already coarsened to the minute.
create table if not exists live_events (
  ts        timestamptz not null,
  type      text not null,
  sid       text not null,
  uid       text,
  course    text not null,
  lo        text,
  lo_type   text,
  service   text
);

select create_hypertable('live_events', 'ts', if_not_exists => true);

create index if not exists live_events_course_ts on live_events (course, ts desc);
create index if not exists live_events_service_ts on live_events (service, ts desc) where service is not null;

-- Views and service touches per hour. Summable along every axis, which is what
-- the heat maps and the time series read.
create materialized view if not exists live_hourly
with (timescaledb.continuous) as
select time_bucket('1 hour', ts) as bucket,
       course,
       service,
       lo_type,
       count(*) filter (where type = 'lo.viewed')    as views,
       count(*) filter (where type = 'service.used') as service_touches
from live_events
group by bucket, course, service, lo_type
with no data;

select add_continuous_aggregate_policy('live_hourly',
  start_offset => interval '3 days',
  end_offset   => interval '1 hour',
  schedule_interval => interval '15 minutes',
  if_not_exists => true);

-- Distinct sessions per hour. A plain view, not a continuous aggregate:
-- TimescaleDB cannot materialise count(distinct ...), and a distinct count is
-- the only honest answer for "how many sessions were active in this hour".
-- Bounded by the retention policy below.
create or replace view live_hourly_sessions as
select time_bucket('1 hour', ts) as bucket,
       course,
       count(distinct sid) as sessions
from live_events
group by bucket, course;

-- One row per completed session: the exact source for session counts and durations.
create table if not exists live_sessions (
  sid          text not null,
  course       text not null,
  uid          text,
  started_at   timestamptz not null,
  ended_at     timestamptz not null,
  duration_sec integer not null,
  primary key (sid, course, started_at)
);

create index if not exists live_sessions_started on live_sessions (started_at desc);
create index if not exists live_sessions_course on live_sessions (course, started_at desc);

-- Raw events are kept for 90 days; the aggregates above outlive them.
select add_retention_policy('live_events', interval '90 days', if_not_exists => true);
`;
