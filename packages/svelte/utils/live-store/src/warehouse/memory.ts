import type { LiveEvent } from "@tutors/live-events";
import type { HourlyRow, HourlySessionRow, LoTotals, Range, SessionRow, Warehouse } from "../types.ts";

/**
 * The warehouse with no database behind it.
 *
 * It rolls up on read rather than on a schedule, which is the right trade at
 * the volumes a single process can hold and keeps the memory deployment honest:
 * the numbers it returns are computed from the same events TimescaleDB would
 * have stored, by the same rules.
 */
export interface MemoryWarehouseOptions {
  /** Raw events older than this are dropped, mirroring the retention policy. */
  retentionDays?: number;
  /** Largest number of raw events held, so a long-running dev process cannot grow without bound. */
  maxEvents?: number;
}

/** Start of the hour an event falls in, ISO 8601 UTC. */
export function hourBucket(ts: string): string {
  const date = new Date(Date.parse(ts));
  date.setUTCMinutes(0, 0, 0);
  return date.toISOString();
}

export function createMemoryWarehouse(options: MemoryWarehouseOptions = {}): Warehouse {
  const retentionDays = options.retentionDays ?? 90;
  const maxEvents = options.maxEvents ?? 200_000;
  let events: LiveEvent[] = [];
  /**
   * Keyed the same way `live_sessions` is: a token can open the same course
   * twice in a day, and keying on the token alone would silently drop the
   * second visit - which is the whole of the "came back" metric.
   */
  const sessionsByKey = new Map<string, SessionRow>();
  const sessionKey = (session: SessionRow) => `${session.sid}|${session.course}|${session.startedAt}`;

  const inRange = (ts: string, range: Range) => {
    const at = Date.parse(ts);
    return at >= range.from.getTime() && at <= range.to.getTime();
  };
  const matches = (event: LiveEvent, range: Range) =>
    inRange(event.ts, range) && (range.course === undefined || event.course === range.course);

  return {
    kind: "memory",

    async append(incoming: LiveEvent[]): Promise<void> {
      events.push(...incoming);
      const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      events = events.filter((event) => Date.parse(event.ts) >= cutoff);
      if (events.length > maxEvents) events = events.slice(events.length - maxEvents);
    },

    async upsertSession(session: SessionRow): Promise<void> {
      sessionsByKey.set(sessionKey(session), session);
    },

    async hourly(range: Range): Promise<HourlyRow[]> {
      const rows = new Map<string, HourlyRow>();
      for (const event of events) {
        if (!matches(event, range)) continue;
        if (event.type !== "lo.viewed" && event.type !== "service.used") continue;
        const service = event.type === "service.used" ? event.service : null;
        const loType = event.type === "lo.viewed" ? event.loType : null;
        const bucket = hourBucket(event.ts);
        const key = `${bucket}|${event.course}|${service ?? ""}|${loType ?? ""}`;
        const row = rows.get(key) ?? { bucket, course: event.course, service, loType, views: 0, serviceTouches: 0 };
        if (event.type === "lo.viewed") row.views += 1;
        else row.serviceTouches += 1;
        rows.set(key, row);
      }
      return [...rows.values()].sort(byBucketThenCourse);
    },

    async hourlySessions(range: Range): Promise<HourlySessionRow[]> {
      const sids = new Map<string, Set<string>>();
      for (const event of events) {
        if (!matches(event, range)) continue;
        const key = `${hourBucket(event.ts)}|${event.course}`;
        const bucket = sids.get(key) ?? new Set<string>();
        bucket.add(event.sid);
        sids.set(key, bucket);
      }
      return [...sids.entries()]
        .map(([key, members]) => {
          const [bucket, course] = key.split("|");
          return { bucket, course, sessions: members.size };
        })
        .sort(byBucketThenCourse);
    },

    async sessions(range: Range): Promise<SessionRow[]> {
      return [...sessionsByKey.values()]
        .filter((session) => {
          if (range.course !== undefined && session.course !== range.course) return false;
          // A session counts in a range it overlaps, not only one it started in.
          return Date.parse(session.endedAt) >= range.from.getTime() && Date.parse(session.startedAt) <= range.to.getTime();
        })
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    },

    async courses(range: Range): Promise<string[]> {
      const names = new Set<string>();
      for (const event of events) if (inRange(event.ts, range)) names.add(event.course);
      return [...names].sort();
    },

    async topLos(range: Range, limit: number): Promise<LoTotals[]> {
      const views = new Map<string, LoTotals>();
      for (const event of events) {
        if (event.type !== "lo.viewed" || !matches(event, range)) continue;
        const entry = views.get(event.lo) ?? { lo: event.lo, loType: event.loType, views: 0 };
        entry.views += 1;
        views.set(event.lo, entry);
      }
      return [...views.values()].sort((a, b) => b.views - a.views || a.lo.localeCompare(b.lo)).slice(0, limit);
    },

    async purgeUid(uid: string): Promise<number> {
      let purged = 0;
      events = events.map((event) => {
        if (event.type === "session.started" && event.uid === uid) {
          purged += 1;
          const purgedEvent: LiveEvent = { ...event };
          delete (purgedEvent as { uid?: string }).uid;
          return purgedEvent;
        }
        return event;
      });
      for (const [key, session] of sessionsByKey) {
        if (session.uid === uid) {
          purged += 1;
          sessionsByKey.set(key, { ...session, uid: null });
        }
      }
      return purged;
    },

    async close(): Promise<void> {
      events = [];
      sessionsByKey.clear();
    }
  };
}

function byBucketThenCourse(a: { bucket: string; course: string }, b: { bucket: string; course: string }): number {
  return a.bucket.localeCompare(b.bucket) || a.course.localeCompare(b.course);
}
