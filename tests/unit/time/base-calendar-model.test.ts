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
// Empty entries
// ===========================================================================
describe("BaseCalendarModel with empty entries", () => {
  it("produces empty tables and no dates/weeks", () => {
    const model = new BaseCalendarModel([], null);
    expect(model.day.rows).toEqual([]);
    expect(model.week.rows).toEqual([]);
    expect(model.medianByDay.row).toBeNull();
    expect(model.medianByWeek.row).toBeNull();
    expect(model.dates).toEqual([]);
    expect(model.weeks).toEqual([]);
    expect(model.error).toBeNull();
  });
});

// ===========================================================================
// Error propagation
// ===========================================================================
describe("BaseCalendarModel error propagation", () => {
  it("passes through a non-null error string", () => {
    const model = new BaseCalendarModel([], "something went wrong");
    expect(model.error).toBe("something went wrong");
  });

  it("passes null error when no error", () => {
    const model = new BaseCalendarModel([makeEntry()], null);
    expect(model.error).toBeNull();
  });
});

// ===========================================================================
// Single student, single date
// ===========================================================================
describe("BaseCalendarModel with single student, single date", () => {
  const entry = makeEntry({
    id: "2025-01-08", // Wednesday
    studentid: "alice",
    timeactive: 45,
    full_name: "Alice Smith"
  });

  it("day view has 1 row with correct value and totalSeconds", () => {
    const model = new BaseCalendarModel([entry], null);
    expect(model.day.rows).toHaveLength(1);
    const row = model.day.rows[0];
    expect(row.studentid).toBe("alice");
    expect(row.full_name).toBe("Alice Smith");
    expect(row["2025-01-08"]).toBe(45);
    expect(row.totalSeconds).toBe(45);
  });

  it("week view groups entry to its Monday", () => {
    const model = new BaseCalendarModel([entry], null);
    expect(model.week.rows).toHaveLength(1);
    const row = model.week.rows[0];
    // Wednesday 2025-01-08 -> Monday 2025-01-06
    expect(row["2025-01-06"]).toBe(45);
    expect(row.totalSeconds).toBe(45);
  });

  it("dates array contains the single date", () => {
    const model = new BaseCalendarModel([entry], null);
    expect(model.dates).toEqual(["2025-01-08"]);
  });

  it("weeks array contains the Monday for the entry date", () => {
    const model = new BaseCalendarModel([entry], null);
    expect(model.weeks).toEqual(["2025-01-06"]);
  });
});

// ===========================================================================
// Multiple students, multiple dates
// ===========================================================================
describe("BaseCalendarModel with multiple students, multiple dates", () => {
  const entries: CalendarEntry[] = [
    makeEntry({ id: "2025-01-06", studentid: "bob", timeactive: 30, full_name: "Bob Jones" }),
    makeEntry({ id: "2025-01-07", studentid: "bob", timeactive: 20, full_name: "Bob Jones" }),
    makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 50, full_name: "Alice Smith" }),
    makeEntry({ id: "2025-01-07", studentid: "alice", timeactive: 10, full_name: "Alice Smith" })
  ];

  it("rows are sorted by studentid", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.day.rows[0].studentid).toBe("alice");
    expect(model.day.rows[1].studentid).toBe("bob");
  });

  it("per-date columns are populated correctly in day view", () => {
    const model = new BaseCalendarModel(entries, null);
    const alice = model.day.rows[0];
    expect(alice["2025-01-06"]).toBe(50);
    expect(alice["2025-01-07"]).toBe(10);
    expect(alice.totalSeconds).toBe(60);

    const bob = model.day.rows[1];
    expect(bob["2025-01-06"]).toBe(30);
    expect(bob["2025-01-07"]).toBe(20);
    expect(bob.totalSeconds).toBe(50);
  });

  it("dates are sorted ascending", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.dates).toEqual(["2025-01-06", "2025-01-07"]);
  });
});

// ===========================================================================
// Week view aggregation
// ===========================================================================
describe("BaseCalendarModel week aggregation", () => {
  it("entries on different days of same week sum together", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 10 }), // Monday
      makeEntry({ id: "2025-01-07", studentid: "alice", timeactive: 20 }), // Tuesday
      makeEntry({ id: "2025-01-10", studentid: "alice", timeactive: 30 })  // Friday
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.week.rows).toHaveLength(1);
    // All three days fall in the week of 2025-01-06 (Monday)
    expect(model.week.rows[0]["2025-01-06"]).toBe(60);
    expect(model.week.rows[0].totalSeconds).toBe(60);
  });

  it("entries spanning two weeks produce two week columns", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 10 }), // Week of Jan 6
      makeEntry({ id: "2025-01-13", studentid: "alice", timeactive: 25 })  // Week of Jan 13
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.weeks).toEqual(["2025-01-06", "2025-01-13"]);
    expect(model.week.rows[0]["2025-01-06"]).toBe(10);
    expect(model.week.rows[0]["2025-01-13"]).toBe(25);
    expect(model.week.rows[0].totalSeconds).toBe(35);
  });
});

// ===========================================================================
// Median calculation
// ===========================================================================
describe("BaseCalendarModel median calculation", () => {
  it("median of odd count (3 values) returns middle", () => {
    // 3 students on same date: 10, 20, 30 -> median = 20
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 10 }),
      makeEntry({ id: "2025-01-06", studentid: "b", timeactive: 30 }),
      makeEntry({ id: "2025-01-06", studentid: "c", timeactive: 20 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row).not.toBeNull();
    expect(model.medianByDay.row!["2025-01-06"]).toBe(20);
  });

  it("median of even count (4 values) returns rounded average of two middles", () => {
    // 4 students: 10, 20, 30, 40 -> sorted: 10,20,30,40 -> median = round((20+30)/2) = 25
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 10 }),
      makeEntry({ id: "2025-01-06", studentid: "b", timeactive: 40 }),
      makeEntry({ id: "2025-01-06", studentid: "c", timeactive: 20 }),
      makeEntry({ id: "2025-01-06", studentid: "d", timeactive: 30 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row!["2025-01-06"]).toBe(25);
  });

  it("median of single value returns that value", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 42 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row!["2025-01-06"]).toBe(42);
  });

  it("median of all zeros returns 0", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 0 }),
      makeEntry({ id: "2025-01-06", studentid: "b", timeactive: 0 }),
      makeEntry({ id: "2025-01-06", studentid: "c", timeactive: 0 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row!["2025-01-06"]).toBe(0);
  });
});

// ===========================================================================
// medianByDay totalSeconds
// ===========================================================================
describe("BaseCalendarModel medianByDay totalSeconds", () => {
  it("totalSeconds is median of per-student totals", () => {
    // alice: 10+20=30, bob: 40+50=90, carol: 60+70=130
    // sorted totals: [30, 90, 130] -> median = 90
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 10 }),
      makeEntry({ id: "2025-01-07", studentid: "alice", timeactive: 20 }),
      makeEntry({ id: "2025-01-06", studentid: "bob", timeactive: 40 }),
      makeEntry({ id: "2025-01-07", studentid: "bob", timeactive: 50 }),
      makeEntry({ id: "2025-01-06", studentid: "carol", timeactive: 60 }),
      makeEntry({ id: "2025-01-07", studentid: "carol", timeactive: 70 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row!.totalSeconds).toBe(90);
  });
});

// ===========================================================================
// medianByWeek
// ===========================================================================
describe("BaseCalendarModel medianByWeek", () => {
  it("aggregates day medians into weeks and computes totalSeconds", () => {
    // Two dates in the same week (Mon 2025-01-06 and Tue 2025-01-07)
    // 2 students: alice (10, 20), bob (30, 40)
    // day medians: Jan 6 = median(10,30)=20, Jan 7 = median(20,40)=30
    // week sum for 2025-01-06: 20+30=50
    // totalSeconds = median([50]) = 50
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 10 }),
      makeEntry({ id: "2025-01-07", studentid: "alice", timeactive: 20 }),
      makeEntry({ id: "2025-01-06", studentid: "bob", timeactive: 30 }),
      makeEntry({ id: "2025-01-07", studentid: "bob", timeactive: 40 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByWeek.row).not.toBeNull();
    expect(model.medianByWeek.row!["2025-01-06"]).toBe(50);
    expect(model.medianByWeek.row!.totalSeconds).toBe(50);
  });
});

// ===========================================================================
// full_name mapping
// ===========================================================================
describe("BaseCalendarModel full_name mapping", () => {
  it("uses full_name from entries in rows", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "gh-user", full_name: "Jane Doe", timeactive: 10 })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.day.rows[0].full_name).toBe("Jane Doe");
  });

  it("uses first encountered full_name for each student", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "gh-user", full_name: "Jane Doe", timeactive: 10 }),
      makeEntry({ id: "2025-01-07", studentid: "gh-user", full_name: "Jane D.", timeactive: 20 })
    ];
    const model = new BaseCalendarModel(entries, null);
    // nameMap sets first encountered name
    expect(model.day.rows[0].full_name).toBe("Jane Doe");
  });
});
