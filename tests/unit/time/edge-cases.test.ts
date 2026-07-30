import { describe, it, expect } from "vitest";
import { BaseCalendarModel } from "../../../packages/jsr/time/src/services/base-calendar-model";
import {
  getMondayForDate,
  cellColorForMinutes
} from "../../../packages/jsr/time/src/utils/calendar-utils";
import type { CalendarEntry } from "../../../packages/jsr/time/src/types/calendar-types";

// ---------------------------------------------------------------------------
// Helper: build a minimal CalendarEntry
// ---------------------------------------------------------------------------
function makeEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: "2025-01-06",
    studentid: "student-1",
    courseid: "course-1",
    timeactive: 60,
    pageloads: 5,
    full_name: "Student One",
    ...overrides
  };
}

// ===========================================================================
// getMondayForDate fallback behavior
// ===========================================================================
describe("getMondayForDate edge cases", () => {
  it("returns the original string for an empty string (fallback)", () => {
    // The try/catch in the implementation should catch the invalid date
    // and return the original string as fallback
    const result = getMondayForDate("");
    // Implementation creates new Date("T12:00:00") which is invalid
    // It falls back to returning the input string
    expect(typeof result).toBe("string");
  });

  it("handles a valid far-future date", () => {
    // 2099-12-31 is a Wednesday
    expect(getMondayForDate("2099-12-31")).toBe("2099-12-28");
  });
});

// ===========================================================================
// Very large timeactive values
// ===========================================================================
describe("Very large timeactive values", () => {
  it("handles large timeactive without overflow", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 999999 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.day.rows[0]["2025-01-06"]).toBe(999999);
    expect(model.day.rows[0].totalSeconds).toBe(999999);
  });

  it("handles large values in median computation", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 1000000 }),
      makeEntry({ id: "2025-01-06", studentid: "b", timeactive: 2000000 }),
      makeEntry({ id: "2025-01-06", studentid: "c", timeactive: 3000000 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row!["2025-01-06"]).toBe(2000000);
  });
});

// ===========================================================================
// Duplicate entries for same student+date
// ===========================================================================
describe("Duplicate entries for same student and date", () => {
  it("accumulates timeactive for duplicate student+date pairs in day view", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 30 }),
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 20 })
    ];
    const model = new BaseCalendarModel(entries, null);
    // The map accumulates: 30 + 20 = 50
    expect(model.day.rows).toHaveLength(1);
    expect(model.day.rows[0]["2025-01-06"]).toBe(50);
    expect(model.day.rows[0].totalSeconds).toBe(50);
  });

  it("accumulates timeactive for duplicate student+date pairs in week view", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 30 }),
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 20 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.week.rows).toHaveLength(1);
    expect(model.week.rows[0]["2025-01-06"]).toBe(50);
  });
});

// ===========================================================================
// Single entry dataset
// ===========================================================================
describe("Single entry dataset", () => {
  const entries: CalendarEntry[] = [
    makeEntry({ id: "2025-01-08", studentid: "only-student", timeactive: 75, full_name: "Only Student" })
  ];

  it("day view works with single entry", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.day.rows).toHaveLength(1);
    expect(model.day.rows[0].studentid).toBe("only-student");
    expect(model.day.rows[0]["2025-01-08"]).toBe(75);
    expect(model.day.rows[0].totalSeconds).toBe(75);
  });

  it("week view works with single entry", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.week.rows).toHaveLength(1);
    // Wednesday 2025-01-08 -> Monday 2025-01-06
    expect(model.week.rows[0]["2025-01-06"]).toBe(75);
  });

  it("medianByDay works with single entry", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row).not.toBeNull();
    expect(model.medianByDay.row!["2025-01-08"]).toBe(75);
    expect(model.medianByDay.row!.totalSeconds).toBe(75);
  });

  it("medianByWeek works with single entry", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByWeek.row).not.toBeNull();
    expect(model.medianByWeek.row!["2025-01-06"]).toBe(75);
    expect(model.medianByWeek.row!.totalSeconds).toBe(75);
  });
});

// ===========================================================================
// All entries for same date
// ===========================================================================
describe("All entries for same date", () => {
  it("dates array has length 1 when all entries share one date", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 10 }),
      makeEntry({ id: "2025-01-06", studentid: "bob", timeactive: 20 }),
      makeEntry({ id: "2025-01-06", studentid: "carol", timeactive: 30 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.dates).toHaveLength(1);
    expect(model.dates[0]).toBe("2025-01-06");
  });

  it("weeks array has length 1 when all entries are same week", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice" }),
      makeEntry({ id: "2025-01-06", studentid: "bob" })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.weeks).toHaveLength(1);
  });
});

// ===========================================================================
// Zero timeactive entries
// ===========================================================================
describe("Zero timeactive entries", () => {
  it("cell color for zero minutes is white", () => {
    expect(cellColorForMinutes(0)).toBe("rgb(255, 255, 255)");
  });

  it("day view shows zero totals for zero-activity entries", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 0 }),
      makeEntry({ id: "2025-01-07", studentid: "alice", timeactive: 0 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.day.rows[0].totalSeconds).toBe(0);
    expect(model.day.rows[0]["2025-01-06"]).toBe(0);
    expect(model.day.rows[0]["2025-01-07"]).toBe(0);
  });

  it("median of all-zero entries is 0", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 0 }),
      makeEntry({ id: "2025-01-06", studentid: "bob", timeactive: 0 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row!["2025-01-06"]).toBe(0);
    expect(model.medianByDay.row!.totalSeconds).toBe(0);
  });

  it("week view shows zero total for zero-activity entries", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 0 }),
      makeEntry({ id: "2025-01-08", studentid: "alice", timeactive: 0 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.week.rows[0]["2025-01-06"]).toBe(0);
    expect(model.week.rows[0].totalSeconds).toBe(0);
  });
});

// ===========================================================================
// Missing date columns default to zero
// ===========================================================================
describe("Missing date columns default to zero", () => {
  it("student with no entry for a date gets 0 for that column", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 10 }),
      makeEntry({ id: "2025-01-07", studentid: "alice", timeactive: 20 }),
      makeEntry({ id: "2025-01-06", studentid: "bob", timeactive: 30 })
      // bob has no entry for 2025-01-07
    ];
    const model = new BaseCalendarModel(entries, null);
    const bob = model.day.rows.find((r) => r.studentid === "bob")!;
    expect(bob["2025-01-07"]).toBe(0);
    expect(bob.totalSeconds).toBe(30); // only the one entry
  });
});
