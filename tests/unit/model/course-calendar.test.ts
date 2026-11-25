import { afterEach, describe, expect, it, vi } from "vitest";
import { addTransport, removeTransport, type LogEntry } from "../../../packages/platform/logger-core/src/index.ts";
import { decorateCourseTree as decoratePublishedCourseTree, initCalendar, type Course } from "../../../packages/jsr/model/src/tutors.ts";

/** Three teaching weeks, one week apart, in the new calendar format. */
function courseWithCalendar(): Course {
  return {
    calendar: {
      title: "Semester 1",
      year: 2026,
      weeks: [
        { date: "2026-09-07", week: 1, topic: "Week One" },
        { date: "2026-09-14", week: 2, topic: "Week Two" },
        { date: "2026-09-21", week: 3, topic: "Week Three" },
        { date: "2026-09-28", week: 4, topic: "Week Four" }
      ]
    }
  } as unknown as Course;
}

describe("initCalendar: which week is current", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses the instant it is given, not the system clock", () => {
    const course = courseWithCalendar();
    initCalendar(course, Date.parse("2026-09-16T09:05:00.000Z"));
    expect(course.courseCalendar?.currentWeek?.title).toBe("Week Two");
  });

  it("gives the same answer however long ago or far ahead the system clock is", () => {
    const frozen = Date.parse("2026-09-16T09:05:00.000Z");
    for (const systemNow of ["2020-01-01T00:00:00Z", "2026-09-30T00:00:00Z", "2040-06-01T00:00:00Z"]) {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(systemNow));
      const course = courseWithCalendar();
      initCalendar(course, frozen);
      expect(course.courseCalendar?.currentWeek?.title).toBe("Week Two");
      vi.useRealTimers();
    }
  });

  it("reads no clock of its own: with no instant the calendar is built and no week is current", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
    try {
      const course = courseWithCalendar();
      expect(initCalendar(course)).toBeUndefined();
      expect(course.courseCalendar?.weeks.length).toBeGreaterThan(0);
      expect(course.courseCalendar?.currentWeek).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the published model library passes the system clock, so its callers are unchanged", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
    try {
      const course = courseWithCalendar();
      course.los = [];
      decoratePublishedCourseTree(course);
      expect(course.courseCalendar?.currentWeek?.title).toBe("Week Three");
    } finally {
      vi.useRealTimers();
    }
  });

  it("has no current week before the first or after the last dated week", () => {
    const before = courseWithCalendar();
    initCalendar(before, Date.parse("2026-01-01T00:00:00Z"));
    expect(before.courseCalendar?.currentWeek).toBeUndefined();

    const after = courseWithCalendar();
    initCalendar(after, Date.parse("2027-01-01T00:00:00Z"));
    expect(after.courseCalendar?.currentWeek).toBeUndefined();
  });

  it("the published model library logs a calendar it cannot read through the shared logger, and still builds the course", () => {
    const entries: LogEntry[] = [];
    const transport = (entry: LogEntry) => void entries.push(entry);
    const quiet = vi.spyOn(console, "warn").mockImplementation(() => {});
    addTransport(transport);
    try {
      const course = { type: "course", title: "C", los: [], calendar: { title: "S1", weeks: [null] } } as unknown as Course;
      decoratePublishedCourseTree(course, "cid", "cid.netlify.app");
      expect(course.courseId).toBe("cid");
      expect(course.courseCalendar).toBeUndefined();
      expect(entries).toEqual([expect.objectContaining({ level: "warn", message: "Error loading calendar", error: expect.stringMatching(/.+/) })]);
    } finally {
      removeTransport(transport);
      quiet.mockRestore();
    }
  });
});
