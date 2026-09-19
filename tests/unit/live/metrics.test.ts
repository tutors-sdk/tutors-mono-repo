import { describe, expect, it } from "vitest";
import {
  RANGES,
  dailySeries,
  daysBetween,
  headlineStats,
  isRangeName,
  localDay,
  median,
  percentile,
  rangeFor,
  serviceMix,
  topCourses,
  type HourlyRow,
  type HourlySessionRow,
  type SessionRow
} from "@tutors/live-store";

/**
 * The arithmetic behind the headline row.
 *
 * These are the numbers someone will quote in a meeting, so the definitions are
 * pinned here rather than left to whatever the SQL happened to do.
 */

const now = new Date(2026, 8, 17, 14, 30);

function session(sid: string, course: string, durationSec: number, uid: string | null = null): SessionRow {
  return { sid, course, uid, startedAt: now.toISOString(), endedAt: now.toISOString(), durationSec };
}

function hourly(course: string, overrides: Partial<HourlyRow> = {}): HourlyRow {
  return { bucket: now.toISOString(), course, service: null, loType: "lab", views: 0, serviceTouches: 0, ...overrides };
}

describe("ranges", () => {
  it("offers exactly the three the dashboard switches between", () => {
    expect([...RANGES]).toEqual(["today", "7d", "30d"]);
    expect(isRangeName("7d")).toBe(true);
    expect(isRangeName("all-time")).toBe(false);
  });

  it("starts today at local midnight and the rest a whole number of days back", () => {
    expect(rangeFor("today", now).from.getHours()).toBe(0);
    expect(rangeFor("today", now).from.getDate()).toBe(17);
    expect(Math.round((now.getTime() - rangeFor("7d", now).from.getTime()) / 86_400_000)).toBe(7);
    expect(Math.round((now.getTime() - rangeFor("30d", now).from.getTime()) / 86_400_000)).toBe(30);
  });

  it("carries the course filter through", () => {
    expect(rangeFor("7d", now, "cs101").course).toBe("cs101");
    expect(rangeFor("7d", now).course).toBeUndefined();
  });
});

describe("percentiles", () => {
  it("takes the p-th value by nearest rank", () => {
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 90)).toBe(90);
    expect(percentile([5], 90)).toBe(5);
    expect(percentile([], 90)).toBe(0);
  });

  it("averages the middle pair for an even count", () => {
    expect(median([10, 20, 30, 40])).toBe(25);
    expect(median([10, 20, 30])).toBe(20);
    expect(median([])).toBe(0);
  });

  it("does not reorder the caller's array", () => {
    const durations = [30, 10, 20];
    median(durations);
    expect(durations).toEqual([30, 10, 20]);
  });
});

describe("headline stats", () => {
  it("counts sessions from the session table and views from the rollup", () => {
    const stats = headlineStats(
      "7d",
      null,
      [session("s1", "cs101", 600), session("s2", "cs101", 1200), session("s3", "cs200", 300, "hash-1")],
      [hourly("cs101", { views: 12 }), hourly("cs200", { views: 5 })]
    );

    expect(stats).toMatchObject({
      range: "7d",
      course: null,
      sessions: 3,
      uniqueSessions: 3,
      views: 17,
      medianSessionSec: 600,
      activeCourses: 2,
      optedInLearners: 1
    });
  });

  it("counts a token that appears twice once, which is what unique sessions means", () => {
    const stats = headlineStats("today", null, [session("s1", "cs101", 60), session("s1", "cs200", 60)], []);
    expect(stats.sessions).toBe(2);
    expect(stats.uniqueSessions).toBe(1);
  });
});

describe("top courses", () => {
  it("ranks by sessions, then views, and caps the list", () => {
    const sessions = [session("s1", "cs101", 60), session("s2", "cs101", 60), session("s3", "cs200", 60)];
    const rows = [hourly("cs101", { views: 3 }), hourly("cs200", { views: 40 }), hourly("cs300", { views: 1 })];

    expect(topCourses(sessions, rows, 2)).toEqual([
      { course: "cs101", sessions: 2, views: 3 },
      { course: "cs200", sessions: 1, views: 40 }
    ]);
  });
});

describe("daily series", () => {
  it("fills every day in the range, including the empty ones", () => {
    const range = rangeFor("7d", now);
    const sessions: HourlySessionRow[] = [{ bucket: now.toISOString(), course: "cs101", sessions: 4 }];
    const series = dailySeries(range, sessions, [hourly("cs101", { views: 9 })]);

    expect(series).toHaveLength(daysBetween(range.from, range.to).length);
    expect(series.at(-1)).toEqual({ day: localDay(now.toISOString()), sessions: 4, views: 9 });
    expect(series[0]).toMatchObject({ sessions: 0, views: 0 });
  });

  it("ignores a bucket that falls outside the range rather than inventing a day for it", () => {
    const range = rangeFor("today", now);
    const stale = new Date(now.getTime() - 5 * 86_400_000).toISOString();
    const series = dailySeries(range, [{ bucket: stale, course: "cs101", sessions: 99 }], []);
    expect(series.reduce((total, point) => total + point.sessions, 0)).toBe(0);
  });
});

describe("service mix", () => {
  it("lists every catalogued service, including the ones with no touches", () => {
    const mix = serviceMix([hourly("cs101", { service: "lab", serviceTouches: 7 }), hourly("cs101", { service: "pdf", serviceTouches: 2 })]);

    expect(mix[0]).toEqual({ service: "lab", touches: 7 });
    expect(mix[1]).toEqual({ service: "pdf", touches: 2 });
    expect(mix.find((entry) => entry.service === "archive")).toEqual({ service: "archive", touches: 0 });
    expect(mix).toHaveLength(12);
  });

  it("ignores a service name that is not in the catalogue", () => {
    const mix = serviceMix([hourly("cs101", { service: "mainframe", serviceTouches: 99 })]);
    expect(mix.every((entry) => entry.touches === 0)).toBe(true);
  });
});
