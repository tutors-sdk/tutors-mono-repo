import { localDay, median } from "./metrics.ts";
import type { HourlyRow, SessionRow } from "./types.ts";

/**
 * Who has been where, as far as an anonymous model can answer it.
 *
 * A session token is stable for one local day and is thrown away overnight, so
 * "came back" can only ever mean "came back the same day". That is a real and
 * useful number - it separates a cohort that opens a course once from one that
 * dips in and out all afternoon - and it is the only honest one available
 * without making the token follow people between days.
 *
 * Every function here is pure and takes rollup rows, so the counts can be
 * pinned in a test rather than read off a running system.
 */

/** One course, as of the selected range, with today's detail where it applies. */
export interface CourseActivity {
  course: string;
  /** The most recent event seen, from the rollups or from presence. */
  lastSeen: string | null;
  /** Sessions open right now, filled in from the hot store. */
  activeNow: number;
  sessions: number;
  /** Distinct tokens: how many separate visitors, within the limits above. */
  visitors: number;
  /** Sessions belonging to a token that opened the course more than once that day. */
  returningSessions: number;
  /** `returningSessions` as a share of `sessions`, 0 to 1. */
  returningRate: number;
  medianSessionSec: number;
  /** Total time on task across every session in the range. */
  totalTimeSec: number;
  views: number;
}

/** How many tokens opened a course a given number of times in one day. */
export interface RepeatVisits {
  /** Sessions in one day by one token: 1, 2, 3, ... */
  visits: number;
  /** Tokens that did that, summed over every day in the range. */
  tokens: number;
}

export interface ActivityReport {
  courses: CourseActivity[];
  repeatVisits: RepeatVisits[];
  /** Sessions across every course in the range. */
  sessions: number;
  /** Distinct token-days: the closest thing to "visitors" this model can count. */
  visitors: number;
  /** Share of sessions from a token that came back the same day, 0 to 1. */
  returningRate: number;
  lastSeen: string | null;
}

/** Key for "this token, on this day" - the unit the model can actually count. */
function tokenDay(session: SessionRow): string {
  return `${session.sid}|${localDay(session.startedAt)}`;
}

function laterOf(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

/**
 * Sessions per token-day, which every "returning" number is derived from.
 * Exported so a test can state the intermediate rather than infer it.
 */
export function sessionsPerTokenDay(sessions: SessionRow[], course?: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    if (course !== undefined && session.course !== course) continue;
    const key = tokenDay(session);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/** The histogram behind "how many came back", most common first. */
export function repeatVisits(sessions: SessionRow[]): RepeatVisits[] {
  const tokens = new Map<number, number>();
  for (const visits of sessionsPerTokenDay(sessions).values()) {
    tokens.set(visits, (tokens.get(visits) ?? 0) + 1);
  }
  return [...tokens.entries()].map(([visits, count]) => ({ visits, tokens: count })).sort((a, b) => a.visits - b.visits);
}

/**
 * Per-course activity for a range.
 * @param presence active sessions per course, from the hot store.
 */
export function courseActivity(sessions: SessionRow[], hourly: HourlyRow[], presence: Record<string, number> = {}): CourseActivity[] {
  const names = new Set([...sessions.map((session) => session.course), ...hourly.map((row) => row.course), ...Object.keys(presence)]);

  return [...names]
    .map((course) => {
      const mine = sessions.filter((session) => session.course === course);
      const perTokenDay = sessionsPerTokenDay(mine, course);
      const returningSessions = [...perTokenDay.values()].filter((visits) => visits > 1).reduce((total, visits) => total + visits, 0);

      return {
        course,
        lastSeen: mine.reduce<string | null>((latest, session) => laterOf(latest, session.endedAt), null),
        activeNow: presence[course] ?? 0,
        sessions: mine.length,
        visitors: perTokenDay.size,
        returningSessions,
        returningRate: mine.length === 0 ? 0 : returningSessions / mine.length,
        medianSessionSec: median(mine.map((session) => session.durationSec)),
        totalTimeSec: mine.reduce((total, session) => total + session.durationSec, 0),
        views: hourly.filter((row) => row.course === course).reduce((total, row) => total + row.views, 0)
      };
    })
    .sort((a, b) => b.activeNow - a.activeNow || b.sessions - a.sessions || a.course.localeCompare(b.course));
}

/** The whole activity panel: per course, the repeat histogram, and the totals. */
export function activityReport(sessions: SessionRow[], hourly: HourlyRow[], presence: Record<string, number> = {}): ActivityReport {
  const courses = courseActivity(sessions, hourly, presence);
  const perTokenDay = sessionsPerTokenDay(sessions);
  const returning = [...perTokenDay.values()].filter((visits) => visits > 1).reduce((total, visits) => total + visits, 0);

  return {
    courses,
    repeatVisits: repeatVisits(sessions),
    sessions: sessions.length,
    visitors: perTokenDay.size,
    returningRate: sessions.length === 0 ? 0 : returning / sessions.length,
    lastSeen: courses.reduce<string | null>((latest, course) => laterOf(latest, course.lastSeen), null)
  };
}
