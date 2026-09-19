import { coarsenToMinute, type LiveEvent } from "@tutors/live-events";
import type { SqlClient } from "../drivers.ts";
import type { HourlyRow, HourlySessionRow, LoTotals, Range, SessionRow, Warehouse } from "../types.ts";
import { LIVE_SCHEMA_SQL } from "./schema.ts";

/**
 * The warehouse on TimescaleDB.
 *
 * Reads never touch `live_events` directly except through `live_hourly_sessions`,
 * which needs a distinct count; everything else comes from the hourly continuous
 * aggregate or from `live_sessions`.
 */
export function createPostgresWarehouse(sql: SqlClient): Warehouse & { migrate(): Promise<void> } {
  return {
    kind: "postgres",

    /** Applies the schema. Idempotent, so it is safe on every ingest start. */
    async migrate(): Promise<void> {
      await sql.query(LIVE_SCHEMA_SQL);
    },

    async append(events: LiveEvent[]): Promise<void> {
      if (events.length === 0) return;
      const values: unknown[] = [];
      const tuples = events.map((event, index) => {
        const base = index * 8;
        values.push(
          coarsenToMinute(event.ts),
          event.type,
          event.sid,
          event.type === "session.started" ? (event.uid ?? null) : null,
          event.course,
          event.type === "lo.viewed" ? event.lo : event.type === "session.heartbeat" ? (event.lo ?? null) : null,
          event.type === "lo.viewed" ? event.loType : null,
          event.type === "service.used" ? event.service : null
        );
        return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8})`;
      });
      await sql.query(`insert into live_events (ts, type, sid, uid, course, lo, lo_type, service) values ${tuples.join(", ")}`, values);
    },

    async upsertSession(session: SessionRow): Promise<void> {
      await sql.query(
        `insert into live_sessions (sid, course, uid, started_at, ended_at, duration_sec)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (sid, course, started_at)
         do update set ended_at = excluded.ended_at, duration_sec = excluded.duration_sec, uid = excluded.uid`,
        [session.sid, session.course, session.uid, session.startedAt, session.endedAt, session.durationSec]
      );
    },

    async hourly(range: Range): Promise<HourlyRow[]> {
      const { rows } = await sql.query<{
        bucket: Date | string;
        course: string;
        service: string | null;
        lo_type: string | null;
        views: string | number;
        service_touches: string | number;
      }>(
        `select bucket, course, service, lo_type, views, service_touches
         from live_hourly
         where bucket >= $1 and bucket <= $2 and ($3::text is null or course = $3)
         order by bucket, course`,
        [range.from, range.to, range.course ?? null]
      );
      return rows.map((row) => ({
        bucket: iso(row.bucket),
        course: row.course,
        service: row.service,
        loType: row.lo_type,
        views: Number(row.views),
        serviceTouches: Number(row.service_touches)
      }));
    },

    async hourlySessions(range: Range): Promise<HourlySessionRow[]> {
      const { rows } = await sql.query<{ bucket: Date | string; course: string; sessions: string | number }>(
        `select bucket, course, sessions
         from live_hourly_sessions
         where bucket >= $1 and bucket <= $2 and ($3::text is null or course = $3)
         order by bucket, course`,
        [range.from, range.to, range.course ?? null]
      );
      return rows.map((row) => ({ bucket: iso(row.bucket), course: row.course, sessions: Number(row.sessions) }));
    },

    async sessions(range: Range): Promise<SessionRow[]> {
      const { rows } = await sql.query<{
        sid: string;
        course: string;
        uid: string | null;
        started_at: Date | string;
        ended_at: Date | string;
        duration_sec: string | number;
      }>(
        `select sid, course, uid, started_at, ended_at, duration_sec
         from live_sessions
         where ended_at >= $1 and started_at <= $2 and ($3::text is null or course = $3)
         order by started_at`,
        [range.from, range.to, range.course ?? null]
      );
      return rows.map((row) => ({
        sid: row.sid,
        course: row.course,
        uid: row.uid,
        startedAt: iso(row.started_at),
        endedAt: iso(row.ended_at),
        durationSec: Number(row.duration_sec)
      }));
    },

    async courses(range: Range): Promise<string[]> {
      const { rows } = await sql.query<{ course: string }>(
        `select distinct course from live_hourly where bucket >= $1 and bucket <= $2 order by course`,
        [range.from, range.to]
      );
      return rows.map((row) => row.course);
    },

    async topLos(range: Range, limit: number): Promise<LoTotals[]> {
      // The one read that touches raw events: `lo` is too high-cardinality to
      // roll up, and the drill-down asks for a single course at a time.
      const { rows } = await sql.query<{ lo: string; lo_type: string; views: string | number }>(
        `select lo, min(lo_type) as lo_type, count(*) as views
         from live_events
         where type = 'lo.viewed' and lo is not null
           and ts >= $1 and ts <= $2 and ($3::text is null or course = $3)
         group by lo
         order by views desc, lo
         limit $4`,
        [range.from, range.to, range.course ?? null, limit]
      );
      return rows.map((row) => ({ lo: row.lo, loType: row.lo_type, views: Number(row.views) }));
    },

    async purgeUid(uid: string): Promise<number> {
      const events = await sql.query(`update live_events set uid = null where uid = $1`, [uid]);
      const sessions = await sql.query(`update live_sessions set uid = null where uid = $1`, [uid]);
      return rowCount(events) + rowCount(sessions);
    },

    async close(): Promise<void> {
      await sql.end();
    }
  };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowCount(result: { rows: unknown[]; rowCount?: number | null }): number {
  return result.rowCount ?? result.rows.length;
}
