import { SERVICES, type Service } from "@tutors/live-events";
import type { HourlyRow, HourlySessionRow, Range, SessionRow } from "./types.ts";

/**
 * Every number the dashboard shows, derived from rollup rows by pure functions.
 *
 * Keeping the arithmetic here rather than in SQL is what lets the memory and
 * TimescaleDB warehouses answer identically, and what makes "median session
 * length" something a test can pin down.
 */

/** The ranges the dashboard offers. */
export const RANGES = ["today", "7d", "30d"] as const;

export type RangeName = (typeof RANGES)[number];

/** Whether a string names one of the offered ranges. */
export function isRangeName(value: unknown): value is RangeName {
  return typeof value === "string" && (RANGES as readonly string[]).includes(value);
}

/**
 * The window a range name covers, ending now.
 * `today` starts at local midnight; the others are rolling windows, because a
 * "last 7 days" that silently meant "6.3 days" would make week-on-week nonsense.
 */
export function rangeFor(name: RangeName, now: Date = new Date(), course?: string): Range {
  const to = new Date(now.getTime());
  if (name === "today") {
    const from = new Date(now.getTime());
    from.setHours(0, 0, 0, 0);
    return { from, to, ...(course ? { course } : {}) };
  }
  const days = name === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { from, to, ...(course ? { course } : {}) };
}

export interface HeadlineStats {
  range: RangeName;
  course: string | null;
  sessions: number;
  uniqueSessions: number;
  views: number;
  medianSessionSec: number;
  p90SessionSec: number;
  activeCourses: number;
  /** Learners who opted in, counted and never named. */
  optedInLearners: number;
}

export interface CourseTotals {
  course: string;
  sessions: number;
  views: number;
}

export interface SeriesPoint {
  /** Local day, `YYYY-MM-DD`. */
  day: string;
  sessions: number;
  views: number;
}

export interface ServiceMixEntry {
  service: Service;
  touches: number;
}

/** The p-th percentile by nearest rank, on a copy of the input. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
}

/** The median, averaging the middle pair when the count is even. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** The headline tiles for one range. */
export function headlineStats(name: RangeName, course: string | null, sessions: SessionRow[], hourly: HourlyRow[]): HeadlineStats {
  const durations = sessions.map((session) => session.durationSec);
  return {
    range: name,
    course,
    sessions: sessions.length,
    uniqueSessions: new Set(sessions.map((session) => session.sid)).size,
    views: hourly.reduce((total, row) => total + row.views, 0),
    medianSessionSec: median(durations),
    p90SessionSec: percentile(durations, 90),
    activeCourses: new Set([...sessions.map((session) => session.course), ...hourly.map((row) => row.course)]).size,
    optedInLearners: new Set(sessions.map((session) => session.uid).filter((uid): uid is string => Boolean(uid))).size
  };
}

/** Courses ordered by sessions, then views, for the top-courses table. */
export function topCourses(sessions: SessionRow[], hourly: HourlyRow[], limit = 10): CourseTotals[] {
  const totals = new Map<string, CourseTotals>();
  const of = (course: string) => {
    const existing = totals.get(course) ?? { course, sessions: 0, views: 0 };
    totals.set(course, existing);
    return existing;
  };
  for (const session of sessions) of(session.course).sessions += 1;
  for (const row of hourly) of(row.course).views += row.views;
  return [...totals.values()].sort((a, b) => b.sessions - a.sessions || b.views - a.views || a.course.localeCompare(b.course)).slice(0, limit);
}

/**
 * Sessions and views per local day across the whole range, including the days
 * with nothing on them - a sparkline with holes in it reads as missing data
 * rather than as a quiet weekend.
 */
export function dailySeries(range: Range, hourlySessions: HourlySessionRow[], hourly: HourlyRow[]): SeriesPoint[] {
  const points = new Map<string, SeriesPoint>();
  for (const day of daysBetween(range.from, range.to)) points.set(day, { day, sessions: 0, views: 0 });

  for (const row of hourlySessions) {
    const point = points.get(localDay(row.bucket));
    if (point) point.sessions += row.sessions;
  }
  for (const row of hourly) {
    const point = points.get(localDay(row.bucket));
    if (point) point.views += row.views;
  }
  return [...points.values()];
}

/** Service touches over the range, including catalogued services with none. */
export function serviceMix(hourly: HourlyRow[]): ServiceMixEntry[] {
  const touches = new Map<string, number>();
  for (const service of SERVICES) touches.set(service, 0);
  for (const row of hourly) {
    if (!row.service || !touches.has(row.service)) continue;
    touches.set(row.service, (touches.get(row.service) ?? 0) + row.serviceTouches);
  }
  return SERVICES.map((service) => ({ service, touches: touches.get(service) ?? 0 })).sort((a, b) => b.touches - a.touches);
}

/** The local day an ISO instant falls in, `YYYY-MM-DD`. */
export function localDay(iso: string): string {
  return dayOf(new Date(Date.parse(iso)));
}

/** Every local day from `from` to `to` inclusive. */
export function daysBetween(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = new Date(from.getTime());
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(to.getTime());
  last.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= last.getTime()) {
    days.push(dayOf(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function dayOf(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
