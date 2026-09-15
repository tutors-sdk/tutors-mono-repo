import { describe, it, expect, beforeEach } from "vitest";
import { TestWorld } from "../../support/world";
import { BaseCalendarModel } from "../../../../packages/jsr/time/src/services/base-calendar-model";
import { cellColorForMinutes } from "../../../../packages/jsr/time/src/utils/calendar-utils";
import type { CalendarEntry } from "../../../../packages/jsr/time/src/types/calendar-types";

describe("Time: Calendar Analytics", () => {
  let world: TestWorld;

  function makeEntry(studentid: string, date: string, timeactive: number): CalendarEntry {
    return { id: date, studentid, courseid: "course-1", timeactive, pageloads: 1, full_name: studentid };
  }

  beforeEach(() => {
    world = new TestWorld();
  });

  it("shall display calendar heatmap with colour-coded cells for 30 days of activity", () => {
    const entries = world.fixtures.createCalendarDataset(5, 30);
    const calendarEntries: CalendarEntry[] = entries.map((e) => ({
      ...e,
      full_name: e.studentid,
    }));

    const model = new BaseCalendarModel(calendarEntries, null);
    expect(model.day.rows.length).toBeGreaterThan(0);
    expect(model.dates.length).toBeGreaterThan(0);

    const color = cellColorForMinutes(calendarEntries[0].timeactive);
    expect(color).toBeDefined();
  });

  it("shall show list of students active on a specific day with time spent", () => {
    const entries: CalendarEntry[] = [
      makeEntry("alice", "2024-03-15", 45),
      makeEntry("bob", "2024-03-15", 30),
      makeEntry("charlie", "2024-03-16", 60),
    ];

    const model = new BaseCalendarModel(entries, null);
    const dayStudents = model.day.rows.filter((r) => r["2024-03-15"] !== undefined && r["2024-03-15"] > 0);

    expect(dayStudents.length).toBe(2);
  });

  it("shall aggregate activity by week", () => {
    const entries: CalendarEntry[] = [
      makeEntry("alice", "2024-03-11", 10),
      makeEntry("alice", "2024-03-12", 20),
      makeEntry("alice", "2024-03-13", 30),
    ];

    const model = new BaseCalendarModel(entries, null);
    expect(model.week.rows.length).toBeGreaterThan(0);

    const aliceWeek = model.week.rows.find((r) => r.studentid === "alice");
    expect(aliceWeek).toBeDefined();
  });

  it("shall calculate median engagement between min and max values", () => {
    const entries: CalendarEntry[] = [
      makeEntry("alice", "2024-03-15", 10),
      makeEntry("bob", "2024-03-15", 30),
      makeEntry("charlie", "2024-03-15", 50),
    ];

    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row).not.toBeNull();
    expect(model.medianByDay.row?.["2024-03-15"]).toBe(30);
  });

  it("shall identify low-engagement students with less than 10 minutes total", () => {
    const entries: CalendarEntry[] = [
      makeEntry("active-1", "2024-03-15", 60),
      makeEntry("active-2", "2024-03-15", 45),
      makeEntry("low-1", "2024-03-15", 5),
      makeEntry("low-2", "2024-03-15", 3),
      makeEntry("low-3", "2024-03-15", 8),
    ];

    const model = new BaseCalendarModel(entries, null);
    const lowEngagement = model.day.rows.filter((r) => {
      const total = Object.entries(r)
        .filter(([key]) => key !== "studentid" && key !== "totalSeconds")
        .reduce((sum, [, val]) => sum + (typeof val === "number" ? val : 0), 0);
      return total < 10;
    });

    expect(lowEngagement.length).toBe(3);
  });
});
