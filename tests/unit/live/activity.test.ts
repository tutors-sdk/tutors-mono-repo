import { describe, expect, it } from "vitest";
import {
  activityReport,
  courseActivity,
  createMemoryHotStore,
  createMemoryWarehouse,
  repeatVisits,
  sessionHandle,
  sessionsPerTokenDay,
  activityFor,
  type HourlyRow,
  type SessionRow
} from "@tutors/live-store";
import { seed } from "./fixtures.ts";

/**
 * The activity panel.
 *
 * The number that needs pinning hardest is "came back": a token is stable for
 * one local day and thrown away overnight, so it can only ever mean "came back
 * the same day". A change that quietly made it mean anything else would be a
 * change to the privacy model, not a change to a metric.
 */

const now = new Date(2026, 8, 17, 15, 0);

function at(daysAgo: number, hour: number): Date {
  const date = new Date(now.getTime());
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function session(sid: string, course: string, start: Date, durationSec = 600, uid: string | null = null): SessionRow {
  return {
    sid,
    course,
    uid,
    startedAt: start.toISOString(),
    endedAt: new Date(start.getTime() + durationSec * 1000).toISOString(),
    durationSec
  };
}

function hourly(course: string, views: number): HourlyRow {
  return { bucket: now.toISOString(), course, service: null, loType: "lab", views, serviceTouches: 0 };
}

describe("session handles", () => {
  it("are short, stable, and different for different tokens", () => {
    expect(sessionHandle("2026-09-17.abc")).toBe(sessionHandle("2026-09-17.abc"));
    expect(sessionHandle("2026-09-17.abc")).not.toBe(sessionHandle("2026-09-17.abd"));
    expect(sessionHandle("2026-09-17.abc")).toMatch(/^[0-9a-f]{6}$/);
  });

  it("do not contain the token they label", () => {
    expect(sessionHandle("2026-09-17.deadbeef")).not.toContain("deadbeef");
  });
});

describe("sessions per token-day", () => {
  it("counts a token separately on each day, because that is all the token can tell us", () => {
    const sessions = [
      session("t1", "cs101", at(0, 9)),
      session("t1", "cs101", at(0, 14)),
      // Same string, different day: in production this token could not recur,
      // and the count treats it as a different visitor either way.
      session("t1", "cs101", at(1, 9))
    ];

    expect([...sessionsPerTokenDay(sessions).values()].sort()).toEqual([1, 2]);
  });

  it("narrows to one course when asked", () => {
    const sessions = [session("t1", "cs101", at(0, 9)), session("t1", "cs200", at(0, 10))];
    expect([...sessionsPerTokenDay(sessions, "cs101").values()]).toEqual([1]);
  });
});

describe("repeat visits", () => {
  it("is a histogram of sessions per token per day, fewest visits first", () => {
    const sessions = [
      session("a", "cs101", at(0, 9)),
      session("b", "cs101", at(0, 9)),
      session("b", "cs101", at(0, 11)),
      session("c", "cs101", at(0, 9)),
      session("c", "cs101", at(0, 11)),
      session("c", "cs101", at(0, 16))
    ];

    expect(repeatVisits(sessions)).toEqual([
      { visits: 1, tokens: 1 },
      { visits: 2, tokens: 1 },
      { visits: 3, tokens: 1 }
    ]);
  });

  it("is empty rather than undefined when nothing has happened", () => {
    expect(repeatVisits([])).toEqual([]);
  });
});

describe("course activity", () => {
  const sessions = [
    session("a", "cs101", at(0, 9), 300),
    session("b", "cs101", at(0, 10), 900),
    session("b", "cs101", at(0, 14), 1500),
    session("c", "cs200", at(1, 9), 600)
  ];

  it("counts visitors as distinct token-days and sessions as every visit", () => {
    const [cs101] = courseActivity(sessions, [hourly("cs101", 20)]).filter((entry) => entry.course === "cs101");

    expect(cs101).toMatchObject({
      course: "cs101",
      sessions: 3,
      visitors: 2,
      // Both of b's sessions count as returning; a's single visit does not.
      returningSessions: 2,
      views: 20
    });
    expect(cs101.returningRate).toBeCloseTo(2 / 3);
  });

  it("reports the median and the total time on task", () => {
    const [cs101] = courseActivity(sessions, []).filter((entry) => entry.course === "cs101");
    expect(cs101.medianSessionSec).toBe(900);
    expect(cs101.totalTimeSec).toBe(2700);
  });

  it("takes last seen from the most recent session that ended", () => {
    const [cs101] = courseActivity(sessions, []).filter((entry) => entry.course === "cs101");
    expect(cs101.lastSeen).toBe(new Date(at(0, 14).getTime() + 1500 * 1000).toISOString());
  });

  it("folds in presence, and sorts the courses that are live now to the top", () => {
    const rows = courseActivity(sessions, [], { cs200: 4 });
    expect(rows.map((row) => row.course)).toEqual(["cs200", "cs101"]);
    expect(rows[0].activeNow).toBe(4);
  });

  it("lists a course that is active now but has no completed session yet", () => {
    const rows = courseActivity([], [], { "cs999-brand-new": 2 });
    expect(rows).toEqual([
      {
        course: "cs999-brand-new",
        lastSeen: null,
        activeNow: 2,
        sessions: 0,
        visitors: 0,
        returningSessions: 0,
        returningRate: 0,
        medianSessionSec: 0,
        totalTimeSec: 0,
        views: 0
      }
    ]);
  });

  it("reports a zero rate rather than dividing by nothing", () => {
    expect(courseActivity([], [hourly("cs101", 0)])[0].returningRate).toBe(0);
  });
});

describe("activity report", () => {
  it("totals across courses and keeps the repeat histogram beside them", () => {
    const sessions = [
      session("a", "cs101", at(0, 9)),
      session("a", "cs101", at(0, 12)),
      session("b", "cs200", at(0, 9))
    ];
    const report = activityReport(sessions, []);

    expect(report).toMatchObject({ sessions: 3, visitors: 2 });
    expect(report.returningRate).toBeCloseTo(2 / 3);
    expect(report.repeatVisits).toEqual([
      { visits: 1, tokens: 1 },
      { visits: 2, tokens: 1 }
    ]);
  });
});

describe("activity over the pipeline", () => {
  it("answers from a seeded warehouse and folds in who is active now", async () => {
    const warehouse = createMemoryWarehouse();
    const hot = createMemoryHotStore();

    await seed(warehouse, [
      { sid: "t1", course: "cs101", at: at(0, 9), views: [{ lo: "/lab-1", loType: "lab", service: "lab" }], durationSec: 600 },
      { sid: "t1", course: "cs101", at: at(0, 13), views: [{ lo: "/lab-2", loType: "lab", service: "lab" }], durationSec: 900 },
      { sid: "t2", course: "cs200", at: at(2, 10), views: [{ lo: "/talk-1", loType: "talk", service: "talk" }], durationSec: 300 }
    ]);
    await hot.touch({ type: "course.opened", ts: new Date(now.getTime() - 30_000).toISOString(), sid: "t9", course: "cs101" });

    const report = await activityFor(warehouse, hot, "7d", null, now);

    expect(report).toMatchObject({ range: "7d", course: null, sessions: 3, visitors: 2 });
    const cs101 = report.courses.find((entry) => entry.course === "cs101");
    expect(cs101).toMatchObject({ activeNow: 1, sessions: 2, visitors: 1, returningSessions: 2 });
    // Somebody is reading right now, so last seen is now rather than the last
    // session that happened to end.
    expect(cs101?.lastSeen).toBe(report.generatedAt);
  });

  it("narrows to one course, presence included", async () => {
    const warehouse = createMemoryWarehouse();
    const hot = createMemoryHotStore();
    await seed(warehouse, [
      { sid: "t1", course: "cs101", at: at(0, 9), views: [{ lo: "/lab-1", loType: "lab" }] },
      { sid: "t2", course: "cs200", at: at(0, 9), views: [{ lo: "/lab-9", loType: "lab" }] }
    ]);
    await hot.touch({ type: "course.opened", ts: new Date(now.getTime() - 10_000).toISOString(), sid: "t9", course: "cs200" });

    const report = await activityFor(warehouse, hot, "today", "cs101", now);
    expect(report.courses.map((entry) => entry.course)).toEqual(["cs101"]);
    expect(report.sessions).toBe(1);
  });
});
