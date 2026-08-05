import { describe, it, expect } from "vitest";
import { BaseCalendarModel } from "../../../packages/jsr/time/src/services/base-calendar-model";
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
// Large dataset: 10 students, 5 dates
// ===========================================================================
describe("Aggregation with 10 students across 5 dates", () => {
  const studentIds = Array.from({ length: 10 }, (_, i) => `student-${String(i + 1).padStart(2, "0")}`);
  const dates = ["2025-01-06", "2025-01-07", "2025-01-08", "2025-01-09", "2025-01-10"];

  // Each student gets timeactive = (studentIndex+1) * 10 for each date
  const entries: CalendarEntry[] = studentIds.flatMap((sid, si) =>
    dates.map((date) =>
      makeEntry({
        id: date,
        studentid: sid,
        timeactive: (si + 1) * 10,
        full_name: `Student ${si + 1}`
      })
    )
  );

  it("produces 10 rows in day view", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.day.rows).toHaveLength(10);
  });

  it("totalSeconds sums correctly per student in day view", () => {
    const model = new BaseCalendarModel(entries, null);
    // student-01: 10 * 5 dates = 50
    const s1 = model.day.rows.find((r) => r.studentid === "student-01")!;
    expect(s1.totalSeconds).toBe(50);
    // student-10: 100 * 5 dates = 500
    const s10 = model.day.rows.find((r) => r.studentid === "student-10")!;
    expect(s10.totalSeconds).toBe(500);
  });

  it("dates array has all 5 distinct dates", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.dates).toHaveLength(5);
    expect(model.dates).toEqual(dates);
  });
});

// ===========================================================================
// Week aggregation: Mon-Fri entries sum to single week column
// ===========================================================================
describe("Week aggregation for Mon-Fri entries", () => {
  it("entries spanning Mon-Fri produce single week column with sum", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 10 }), // Monday
      makeEntry({ id: "2025-01-07", studentid: "alice", timeactive: 20 }), // Tuesday
      makeEntry({ id: "2025-01-08", studentid: "alice", timeactive: 30 }), // Wednesday
      makeEntry({ id: "2025-01-09", studentid: "alice", timeactive: 40 }), // Thursday
      makeEntry({ id: "2025-01-10", studentid: "alice", timeactive: 50 })  // Friday
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.weeks).toEqual(["2025-01-06"]);
    expect(model.week.rows).toHaveLength(1);
    expect(model.week.rows[0]["2025-01-06"]).toBe(150); // 10+20+30+40+50
    expect(model.week.rows[0].totalSeconds).toBe(150);
  });

  it("entries spanning two weeks produce two week columns", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-10", studentid: "alice", timeactive: 30 }), // Friday week 1
      makeEntry({ id: "2025-01-13", studentid: "alice", timeactive: 70 })  // Monday week 2
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.weeks).toEqual(["2025-01-06", "2025-01-13"]);
    expect(model.week.rows[0]["2025-01-06"]).toBe(30);
    expect(model.week.rows[0]["2025-01-13"]).toBe(70);
    expect(model.week.rows[0].totalSeconds).toBe(100);
  });
});

// ===========================================================================
// Median with uniform data
// ===========================================================================
describe("Median when all students have same activity", () => {
  it("median equals that value for per-date median", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 42 }),
      makeEntry({ id: "2025-01-06", studentid: "bob", timeactive: 42 }),
      makeEntry({ id: "2025-01-06", studentid: "carol", timeactive: 42 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row!["2025-01-06"]).toBe(42);
  });

  it("totalSeconds median equals the common total when all students are equal", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 20 }),
      makeEntry({ id: "2025-01-07", studentid: "alice", timeactive: 30 }),
      makeEntry({ id: "2025-01-06", studentid: "bob", timeactive: 20 }),
      makeEntry({ id: "2025-01-07", studentid: "bob", timeactive: 30 })
    ];
    const model = new BaseCalendarModel(entries, null);
    // Both students total 50, median of [50, 50] = 50
    expect(model.medianByDay.row!.totalSeconds).toBe(50);
  });
});

// ===========================================================================
// Median with highly skewed data
// ===========================================================================
describe("Median with skewed data", () => {
  it("correctly finds middle value ignoring outliers", () => {
    // 5 students with values: 1, 2, 3, 100, 1000
    // Sorted: [1, 2, 3, 100, 1000] -> median = 3
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 1 }),
      makeEntry({ id: "2025-01-06", studentid: "b", timeactive: 1000 }),
      makeEntry({ id: "2025-01-06", studentid: "c", timeactive: 3 }),
      makeEntry({ id: "2025-01-06", studentid: "d", timeactive: 100 }),
      makeEntry({ id: "2025-01-06", studentid: "e", timeactive: 2 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row!["2025-01-06"]).toBe(3);
  });

  it("handles even count with skewed data", () => {
    // 4 students: 1, 2, 100, 1000
    // Sorted: [1, 2, 100, 1000] -> median = round((2+100)/2) = 51
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 1 }),
      makeEntry({ id: "2025-01-06", studentid: "b", timeactive: 1000 }),
      makeEntry({ id: "2025-01-06", studentid: "c", timeactive: 100 }),
      makeEntry({ id: "2025-01-06", studentid: "d", timeactive: 2 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row!["2025-01-06"]).toBe(51);
  });

  it("medianByDay totalSeconds reflects median of skewed totals", () => {
    // 3 students, 1 date each:
    // a: total=5, b: total=500, c: total=50
    // sorted: [5, 50, 500] -> median = 50
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 5 }),
      makeEntry({ id: "2025-01-06", studentid: "b", timeactive: 500 }),
      makeEntry({ id: "2025-01-06", studentid: "c", timeactive: 50 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row!.totalSeconds).toBe(50);
  });
});
