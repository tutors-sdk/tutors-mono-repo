import type { LiveEvent, Service } from "@tutors/live-events";

/**
 * The three seams the live pipeline is built from. Each one has a memory
 * implementation (used by dev, tests and any deployment with no infrastructure)
 * and a networked implementation (Redis/Valkey, TimescaleDB), so the pipeline
 * is exercised end to end whether or not the bus and the database exist yet.
 */

/** A message bus carrying `tutors.live.*`. */
export interface Bus {
  /** Name of the adapter, for `/healthz` and logs. */
  readonly kind: string;
  publish(events: LiveEvent[]): Promise<void>;
  /**
   * Delivers every event published from now on.
   * @returns a function that cancels the subscription.
   */
  subscribe(handler: (event: LiveEvent) => void | Promise<void>): Promise<() => Promise<void>>;
  close(): Promise<void>;
}

/** Who is doing what right now, for the "Now" layer of the dashboard. */
export interface NowSnapshot {
  /** Sessions with a heartbeat inside the active window. */
  activeSessions: number;
  courses: CourseNow[];
  services: ServiceCount[];
  updatedAt: string;
}

export interface CourseNow {
  course: string;
  active: number;
  /** The learning objects those sessions are on, most popular first. */
  los: { lo: string; count: number }[];
}

export interface ServiceCount {
  service: Service;
  count: number;
}

/** The short-lived presence store: everything in it expires. */
export interface HotStore {
  readonly kind: string;
  /** Applies one event to the presence view. */
  touch(event: LiveEvent): Promise<void>;
  /** Presence as of `now`, dropping sessions whose last event is older than the active window. */
  now(at?: Date): Promise<NowSnapshot>;
  close(): Promise<void>;
}

/** One hour of activity for one (course, service, loType) combination. */
export interface HourlyRow {
  /** Start of the hour, ISO 8601 UTC. */
  bucket: string;
  course: string;
  service: string | null;
  loType: string | null;
  views: number;
  serviceTouches: number;
}

/**
 * Distinct sessions per hour per course.
 *
 * Kept apart from `HourlyRow` on purpose: a distinct count cannot be summed
 * across the (service, loType) rows of the same hour, so mixing the two in one
 * rollup is the standard way to over-count sessions by a factor of five.
 */
export interface HourlySessionRow {
  bucket: string;
  course: string;
  sessions: number;
}

/** One learning object and how often it was opened. */
export interface LoTotals {
  lo: string;
  loType: string;
  views: number;
}

/** One completed session. The exact source for session counts and durations. */
export interface SessionRow {
  sid: string;
  course: string;
  /** Present only for a logged-in learner who opted in. */
  uid: string | null;
  startedAt: string;
  endedAt: string;
  durationSec: number;
}

/** A closed time range, used by every warehouse query. */
export interface Range {
  from: Date;
  to: Date;
  course?: string;
}

/** Raw events plus the rollups the dashboard reads. */
export interface Warehouse {
  readonly kind: string;
  /** Appends raw events, with timestamps already coarsened to the minute. */
  append(events: LiveEvent[]): Promise<void>;
  /** Records a session that has ended. Re-recording the same sid replaces it. */
  upsertSession(session: SessionRow): Promise<void>;
  hourly(range: Range): Promise<HourlyRow[]>;
  hourlySessions(range: Range): Promise<HourlySessionRow[]>;
  /** Completed sessions overlapping the range. The exact source for counts and durations. */
  sessions(range: Range): Promise<SessionRow[]>;
  /** Every course seen in the range, for the course filter. */
  courses(range: Range): Promise<string[]>;
  /** The most opened learning objects, for the course drill-down. */
  topLos(range: Range, limit: number): Promise<LoTotals[]>;
  /** Opt-out: removes a learner's `uid` from raw events and sessions. */
  purgeUid(uid: string): Promise<number>;
  close(): Promise<void>;
}
