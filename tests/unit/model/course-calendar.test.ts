import { afterEach, describe, expect, it, vi } from "vitest";
import { initCalendar, type Course } from "../../../packages/jsr/model/src/tutors.ts";

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

  it("reads the system clock when no instant is given, so callers that do not pass one are unchanged", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-22T12:00:00Z"));
    const course = courseWithCalendar();
    initCalendar(course);
    expect(course.courseCalendar?.currentWeek?.title).toBe("Week Three");
  });

  it("has no current week before the first or after the last dated week", () => {
    const before = courseWithCalendar();
    initCalendar(before, Date.parse("2026-01-01T00:00:00Z"));
    expect(before.courseCalendar?.currentWeek).toBeUndefined();

    const after = courseWithCalendar();
    initCalendar(after, Date.parse("2027-01-01T00:00:00Z"));
    expect(after.courseCalendar?.currentWeek).toBeUndefined();
  });
});
