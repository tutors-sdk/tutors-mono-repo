import { describe, it, expect, beforeEach } from "vitest";
import { BaseCalendarModel } from "../../../../packages/jsr/time/src/services/base-calendar-model";
import { cellColorForMinutes } from "../../../../packages/jsr/time/src/utils/calendar-utils";
import type { CalendarEntry } from "../../../../packages/jsr/time/src/types/calendar-types";

describe("Instructor: Calendar Analytics", () => {
  function makeEntry(studentid: string, date: string, timeactive: number): CalendarEntry {
    return { id: date, studentid, courseid: "course-1", timeactive, pageloads: 1, full_name: studentid };
  }

  it("shall display a grid with students as rows and dates as columns", () => {
    const entries: CalendarEntry[] = [
      makeEntry("alice", "2025-01-06", 30),
      makeEntry("alice", "2025-01-07", 45),
      makeEntry("bob", "2025-01-06", 60),
    ];

    const model = new BaseCalendarModel(entries, null);
    expect(model.day.rows).toHaveLength(2);
    expect(model.dates).toEqual(["2025-01-06", "2025-01-07"]);

    const aliceRow = model.day.rows.find((r) => r.studentid === "alice");
    expect(aliceRow?.["2025-01-06"]).toBe(30);
    expect(aliceRow?.["2025-01-07"]).toBe(45);
  });

  it("shall aggregate daily activity into weekly columns", () => {
    const entries: CalendarEntry[] = [
      makeEntry("alice", "2025-01-06", 10),
      makeEntry("alice", "2025-01-07", 20),
      makeEntry("alice", "2025-01-08", 30),
    ];

    const model = new BaseCalendarModel(entries, null);
    const aliceRow = model.week.rows.find((r) => r.studentid === "alice");
    expect(aliceRow?.["2025-01-06"]).toBe(60);
  });

  it("shall calculate median time active per day", () => {
    const entries: CalendarEntry[] = [
      makeEntry("alice", "2025-01-06", 10),
      makeEntry("bob", "2025-01-06", 30),
      makeEntry("charlie", "2025-01-06", 50),
    ];

    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row).not.toBeNull();
    expect(model.medianByDay.row?.["2025-01-06"]).toBe(30);
  });

  it("shall calculate median of weekly sums", () => {
    const entries: CalendarEntry[] = [
      makeEntry("alice", "2025-01-06", 100),
      makeEntry("bob", "2025-01-06", 200),
      makeEntry("charlie", "2025-01-06", 300),
    ];

    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByWeek.row).not.toBeNull();
  });

  it("shall colour code cells by activity level", () => {
    const white = cellColorForMinutes(0);
    const green = cellColorForMinutes(100);
    const red = cellColorForMinutes(600);

    expect(white).toBe("rgb(255, 255, 255)");
    expect(green).not.toBe(white);
    expect(red).not.toBe(green);
  });

  it("shall handle empty calendar data", () => {
    const model = new BaseCalendarModel([], null);

    expect(model.day.rows).toHaveLength(0);
    expect(model.week.rows).toHaveLength(0);
    expect(model.dates).toHaveLength(0);
    expect(model.weeks).toHaveLength(0);
    expect(model.medianByDay.row).toBeNull();
    expect(model.medianByWeek.row).toBeNull();
  });
});
