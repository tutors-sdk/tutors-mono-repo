import { describe, it, expect, vi, afterEach } from "vitest";
import {
  filterByDateRange,
  cellColorForMinutes,
  getMondayForDate,
  formatDateShort,
  getDistinctSortedWeeks
} from "../../../packages/jsr/time/src/utils/calendar-utils";
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
// Survivor #1: filterByDateRange — same-reference shortcut
// ===========================================================================
describe("filterByDateRange reference identity", () => {
  it("returns the SAME array reference (not a copy) when no bounds are specified", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-01" }),
      makeEntry({ id: "2025-01-15" })
    ];
    const result = filterByDateRange(entries, null, null);
    // toBe checks reference identity, not deep equality.
    // If the early return is removed (mutated to `if (false)`), the filter
    // creates a new array and this assertion fails.
    expect(result).toBe(entries);
  });

  it("returns a different array reference when bounds are specified", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-01" }),
      makeEntry({ id: "2025-01-15" })
    ];
    const result = filterByDateRange(entries, "2025-01-01", "2025-12-31");
    // The filtered result is a new array, not the same reference
    expect(result).not.toBe(entries);
    expect(result).toEqual(entries);
  });
});

// ===========================================================================
// Survivor #2: cellColorForMinutes — exact boundary and arithmetic tests
// ===========================================================================
describe("cellColorForMinutes exact RGB values", () => {
  // -------------------------------------------------------------------------
  // mins <= 0  (white)
  // -------------------------------------------------------------------------
  it("returns white for exactly 0 minutes", () => {
    expect(cellColorForMinutes(0)).toBe("rgb(255, 255, 255)");
  });

  it("returns white for -1 (negative)", () => {
    expect(cellColorForMinutes(-1)).toBe("rgb(255, 255, 255)");
  });

  it("returns white for a small negative value (-0.001)", () => {
    // Ensures mins <= 0 catches negatives close to zero
    expect(cellColorForMinutes(-0.001)).toBe("rgb(255, 255, 255)");
  });

  // -------------------------------------------------------------------------
  // 0 < mins <= 1  (white -> lightGreen interpolation)
  //
  // white     = {r:255, g:255, b:255}
  // lightGreen= {r:200, g:255, b:200}
  //
  // At t=0.5 (mins=0.5):
  //   r = round(255 + 0.5*(200-255)) = round(255 - 27.5) = round(227.5) = 228
  //   g = round(255 + 0.5*(255-255)) = 255
  //   b = round(255 + 0.5*(200-255)) = 228
  // -------------------------------------------------------------------------
  it("returns exact interpolated color at 0.5 minutes (white->lightGreen midpoint)", () => {
    expect(cellColorForMinutes(0.5)).toBe("rgb(228, 255, 228)");
  });

  // At t=1 (mins=1): reaches lightGreen exactly
  //   r = round(255 + 1*(-55)) = 200
  //   g = 255
  //   b = 200
  it("returns lightGreen at exactly 1 minute", () => {
    expect(cellColorForMinutes(1)).toBe("rgb(200, 255, 200)");
  });

  // At t=0.25 (mins=0.25):
  //   r = round(255 + 0.25*(-55)) = round(255 - 13.75) = round(241.25) = 241
  //   g = 255
  //   b = 241
  it("returns exact interpolated color at 0.25 minutes", () => {
    expect(cellColorForMinutes(0.25)).toBe("rgb(241, 255, 241)");
  });

  // -------------------------------------------------------------------------
  // 1 < mins <= 200  (lightGreen -> deepGreen)
  //
  // lightGreen= {r:200, g:255, b:200}
  // deepGreen = {r:0,   g:120, b:0  }
  //
  // At mins=2: t = (2-1)/199 = 1/199
  //   r = round(200 + (1/199)*(-200)) = round(200 - 1.00503) = round(198.995) = 199
  //   g = round(255 + (1/199)*(-135)) = round(255 - 0.67839) = round(254.322) = 254
  //   b = 199
  // -------------------------------------------------------------------------
  it("returns exact color at 2 minutes (just past lightGreen boundary)", () => {
    expect(cellColorForMinutes(2)).toBe("rgb(199, 254, 199)");
  });

  // At mins=100: t = 99/199
  //   r = round(200 + (99/199)*(-200)) = round(200 - 99.4975) = round(100.5025) = 101
  //   g = round(255 + (99/199)*(-135)) = round(255 - 67.1608) = round(187.839) = 188
  //   b = 101
  it("returns exact color at 100 minutes (lightGreen->deepGreen midpoint)", () => {
    expect(cellColorForMinutes(100)).toBe("rgb(101, 188, 101)");
  });

  // At mins=200: t = 199/199 = 1 -> deepGreen exactly
  //   r = 0, g = 120, b = 0
  it("returns deepGreen at exactly 200 minutes", () => {
    expect(cellColorForMinutes(200)).toBe("rgb(0, 120, 0)");
  });

  // -------------------------------------------------------------------------
  // 200 < mins <= 400  (deepGreen -> lightRed)
  //
  // deepGreen= {r:0,   g:120, b:0  }
  // lightRed = {r:255, g:180, b:180}
  //
  // At mins=300: t = (300-200)/200 = 0.5
  //   r = round(0 + 0.5*255) = round(127.5) = 128
  //   g = round(120 + 0.5*60) = round(150) = 150
  //   b = round(0 + 0.5*180) = round(90) = 90
  // -------------------------------------------------------------------------
  it("returns exact color at 300 minutes (deepGreen->lightRed midpoint)", () => {
    expect(cellColorForMinutes(300)).toBe("rgb(128, 150, 90)");
  });

  // At mins=400: t = 1 -> lightRed exactly
  //   r = 255, g = 180, b = 180
  it("returns lightRed at exactly 400 minutes", () => {
    expect(cellColorForMinutes(400)).toBe("rgb(255, 180, 180)");
  });

  // -------------------------------------------------------------------------
  // mins > 400  (lightRed -> deepRed)
  //
  // lightRed= {r:255, g:180, b:180}
  // deepRed = {r:180, g:0,   b:0  }
  //
  // At mins=600: t = min(1, (600-400)/400) = 0.5
  //   r = round(255 + 0.5*(-75)) = round(255 - 37.5) = round(217.5) = 218
  //   g = round(180 + 0.5*(-180)) = round(180 - 90) = 90
  //   b = round(180 + 0.5*(-180)) = 90
  // -------------------------------------------------------------------------
  it("returns exact color at 600 minutes (lightRed->deepRed midpoint)", () => {
    expect(cellColorForMinutes(600)).toBe("rgb(218, 90, 90)");
  });

  // At mins=800: t = min(1, 1) = 1 -> deepRed exactly
  //   r = 180, g = 0, b = 0
  it("returns deepRed at exactly 800 minutes", () => {
    expect(cellColorForMinutes(800)).toBe("rgb(180, 0, 0)");
  });

  // At mins=1200: t = min(1, 2) = 1 -> clamped to deepRed
  it("clamps at deepRed beyond 800 minutes", () => {
    expect(cellColorForMinutes(1200)).toBe("rgb(180, 0, 0)");
  });

  // -------------------------------------------------------------------------
  // Additional arithmetic mutation killers: verify values differ between
  // adjacent ranges so any arithmetic change (+ to -, * to /, - to +) in
  // the interpolation math produces a detectably wrong result.
  // -------------------------------------------------------------------------
  it("color at 0.5 differs from both white and lightGreen", () => {
    const half = cellColorForMinutes(0.5);
    expect(half).not.toBe("rgb(255, 255, 255)");
    expect(half).not.toBe("rgb(200, 255, 200)");
  });

  it("color at 100 differs from both lightGreen and deepGreen", () => {
    const mid = cellColorForMinutes(100);
    expect(mid).not.toBe("rgb(200, 255, 200)");
    expect(mid).not.toBe("rgb(0, 120, 0)");
  });

  it("color at 300 differs from both deepGreen and lightRed", () => {
    const mid = cellColorForMinutes(300);
    expect(mid).not.toBe("rgb(0, 120, 0)");
    expect(mid).not.toBe("rgb(255, 180, 180)");
  });

  it("color at 600 differs from both lightRed and deepRed", () => {
    const mid = cellColorForMinutes(600);
    expect(mid).not.toBe("rgb(255, 180, 180)");
    expect(mid).not.toBe("rgb(180, 0, 0)");
  });
});

// ===========================================================================
// Survivors #3, #4, #6: catch-block coverage for formatDateShort,
// getMondayForDate, and getDistinctSortedWeeks (via getMondayForDate)
// ===========================================================================
describe("catch block coverage via Date mock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("formatDateShort returns the original dateString when Date constructor throws", () => {
    const OriginalDate = globalThis.Date;
    // Replace Date with a class whose constructor always throws
    globalThis.Date = class {
      constructor() {
        throw new Error("forced error for test");
      }
    } as unknown as DateConstructor;
    try {
      expect(formatDateShort("bad-date")).toBe("bad-date");
    } finally {
      globalThis.Date = OriginalDate;
    }
  });

  it("getMondayForDate returns the original dateString when Date constructor throws", () => {
    const OriginalDate = globalThis.Date;
    globalThis.Date = class {
      constructor() {
        throw new Error("forced error for test");
      }
    } as unknown as DateConstructor;
    try {
      expect(getMondayForDate("invalid-input")).toBe("invalid-input");
    } finally {
      globalThis.Date = OriginalDate;
    }
  });

  it("getDistinctSortedWeeks returns raw date ids when getMondayForDate falls back", () => {
    const OriginalDate = globalThis.Date;
    globalThis.Date = class {
      constructor() {
        throw new Error("forced error for test");
      }
    } as unknown as DateConstructor;
    try {
      const entries: CalendarEntry[] = [
        makeEntry({ id: "2025-01-08" }),
        makeEntry({ id: "2025-01-06" })
      ];
      // When Date throws, getMondayForDate returns the raw id.
      // getDistinctSortedWeeks deduplicates and sorts those raw ids.
      const result = getDistinctSortedWeeks(entries);
      expect(result).toEqual(["2025-01-06", "2025-01-08"]);
    } finally {
      globalThis.Date = OriginalDate;
    }
  });
});

// ===========================================================================
// BaseCalendarModel mutation survivors
// ===========================================================================

// ---------------------------------------------------------------------------
// Survivor #7: courseId ternary — entries.length > 0 ? entries[0].courseid : ""
// Must verify courseId is extracted from entries, not defaulting to "".
// Three locations: buildPivotedRows (day/week), buildMedianByDayView, buildMedianByWeekView.
// ---------------------------------------------------------------------------
describe("BaseCalendarModel courseId extraction", () => {
  const entries: CalendarEntry[] = [
    makeEntry({ id: "2025-01-06", studentid: "alice", courseid: "cs101", timeactive: 10, full_name: "Alice" }),
    makeEntry({ id: "2025-01-07", studentid: "alice", courseid: "cs101", timeactive: 20, full_name: "Alice" })
  ];

  it("day view rows carry the correct courseid from entries", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.day.rows[0].courseid).toBe("cs101");
  });

  it("week view rows carry the correct courseid from entries", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.week.rows[0].courseid).toBe("cs101");
  });

  it("medianByDay row carries the correct courseid from entries", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row).not.toBeNull();
    expect(model.medianByDay.row!.courseid).toBe("cs101");
  });

  it("medianByWeek row carries the correct courseid from entries", () => {
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByWeek.row).not.toBeNull();
    expect(model.medianByWeek.row!.courseid).toBe("cs101");
  });

  it("courseid defaults to empty string when entries array is empty", () => {
    const model = new BaseCalendarModel([], null);
    // With empty entries, day/week rows are empty and medians are null.
    // The ternary should return "" but there are no rows to observe it in.
    // This test documents that empty entries produce no rows.
    expect(model.day.rows).toHaveLength(0);
    expect(model.medianByDay.row).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Survivor #8: full_name fallback (nameMap.get(studentid) ?? studentid)
// Mutation: ?? -> && would return studentid instead of the mapped name.
// Need to verify the WEEK view path specifically (line 84).
// ---------------------------------------------------------------------------
describe("BaseCalendarModel full_name in week view", () => {
  it("week view uses full_name from nameMap, not the raw studentid", () => {
    const entries: CalendarEntry[] = [
      makeEntry({
        id: "2025-01-08", // Wednesday -> week of 2025-01-06
        studentid: "gh-user-42",
        full_name: "Jane Doe",
        timeactive: 30
      })
    ];
    const model = new BaseCalendarModel(entries, null);
    // With the ?? operator, full_name = "Jane Doe" (from nameMap).
    // With the && mutation, full_name = "gh-user-42" (the studentid).
    expect(model.week.rows[0].full_name).toBe("Jane Doe");
    expect(model.week.rows[0].studentid).toBe("gh-user-42");
    // Verify they differ to ensure the test is meaningful
    expect(model.week.rows[0].full_name).not.toBe(model.week.rows[0].studentid);
  });

  it("day view also uses full_name from nameMap, not the raw studentid", () => {
    const entries: CalendarEntry[] = [
      makeEntry({
        id: "2025-01-06",
        studentid: "gh-user-99",
        full_name: "Bob Builder",
        timeactive: 15
      })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.day.rows[0].full_name).toBe("Bob Builder");
    expect(model.day.rows[0].full_name).not.toBe("gh-user-99");
  });
});

// ---------------------------------------------------------------------------
// Survivor #9: median empty guard (if (!values.length) return 0 -> if (false))
// When called with [], the mutated version proceeds to sorted = [],
// n = 0, mid = 0, sorted[-1] = undefined, sorted[0] = undefined,
// returning NaN instead of 0. We trigger this via buildMedianByWeek
// with all-zero entries.
// ---------------------------------------------------------------------------
describe("BaseCalendarModel median with empty values", () => {
  it("private median returns 0 for empty array (direct access)", () => {
    const model = new BaseCalendarModel([], null);
    // Access private method directly to verify the guard
    const result = (model as any).median([]);
    expect(result).toBe(0);
    // With the mutation (if (false)), this would be NaN
    expect(typeof result).toBe("number");
    expect(Number.isNaN(result)).toBe(false);
  });

  it("medianByWeek totalSeconds is 0 (not NaN) when all entries have 0 timeactive", () => {
    // All entries have timeactive=0, so all dateMedians are 0.
    // In buildMedianByWeek, dateMedian > 0 is false for all, so allWeekSums
    // remains empty. median([]) should return 0 via the guard.
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 0, full_name: "A" }),
      makeEntry({ id: "2025-01-13", studentid: "a", timeactive: 0, full_name: "A" })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByWeek.row).not.toBeNull();
    expect(model.medianByWeek.row!.totalSeconds).toBe(0);
    // Mutated median([]) would return NaN
    expect(Number.isNaN(model.medianByWeek.row!.totalSeconds)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Survivor #10: buildMedianByDay filter
// entries.filter((entry) => entry.id === date) -> entries
// If filter is removed, all entries are used for every date's median,
// collapsing per-date differences.
// ---------------------------------------------------------------------------
describe("BaseCalendarModel per-date median filtering", () => {
  it("getMedianForDate filters entries by date (per-date medians differ)", () => {
    // Date A has low values, date B has high values.
    // With the filter, medians differ. Without, they are the same.
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 10, full_name: "A" }),
      makeEntry({ id: "2025-01-07", studentid: "a", timeactive: 90, full_name: "A" })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByDay.row).not.toBeNull();
    // With filter: medianByDay["2025-01-06"] = median([10]) = 10
    //              medianByDay["2025-01-07"] = median([90]) = 90
    // Without filter: both = median([10, 90]) = round((10+90)/2) = 50
    expect(model.medianByDay.row!["2025-01-06"]).toBe(10);
    expect(model.medianByDay.row!["2025-01-07"]).toBe(90);
    expect(model.medianByDay.row!["2025-01-06"]).not.toBe(model.medianByDay.row!["2025-01-07"]);
  });

  it("per-date medians differ with multiple students and dates", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 5, full_name: "A" }),
      makeEntry({ id: "2025-01-06", studentid: "b", timeactive: 15, full_name: "B" }),
      makeEntry({ id: "2025-01-07", studentid: "a", timeactive: 100, full_name: "A" }),
      makeEntry({ id: "2025-01-07", studentid: "b", timeactive: 200, full_name: "B" })
    ];
    const model = new BaseCalendarModel(entries, null);
    // With filter: Jan 6 = median([5, 15]) = 10, Jan 7 = median([100, 200]) = 150
    // Without filter: both = median([5, 15, 100, 200]) = round((15+100)/2) = 58
    expect(model.medianByDay.row!["2025-01-06"]).toBe(10);
    expect(model.medianByDay.row!["2025-01-07"]).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Survivor #11: getMedianForDate empty guard
// if (!entriesForDate.length) return 0 -> if (false) return 0
// Normally every date in this.dates has entries, so this guard is never
// triggered through the public API. Test it directly.
// ---------------------------------------------------------------------------
describe("BaseCalendarModel getMedianForDate empty guard", () => {
  it("private getMedianForDate returns 0 for a date with no matching entries", () => {
    const model = new BaseCalendarModel([], null);
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 50, full_name: "A" })
    ];
    // Call with a date that has no entries
    const result = (model as any).getMedianForDate(entries, "2025-12-31");
    expect(result).toBe(0);
  });

  it("private getMedianForDate returns correct median for a date with entries", () => {
    const model = new BaseCalendarModel([], null);
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 10, full_name: "A" }),
      makeEntry({ id: "2025-01-06", studentid: "b", timeactive: 30, full_name: "B" })
    ];
    const result = (model as any).getMedianForDate(entries, "2025-01-06");
    // median([10, 30]) = round((10+30)/2) = 20
    expect(result).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Survivor #12: students sort removal in buildMedianByDay (line 143)
// The sort order of students doesn't affect median computation
// (median sorts internally), so this is an equivalent mutant.
// However, we exercise the code path with unordered student IDs to
// ensure coverage.
// ---------------------------------------------------------------------------
describe("BaseCalendarModel student ordering in median computation", () => {
  it("median totalSeconds is correct regardless of student insertion order", () => {
    // Students inserted in reverse alphabetical order
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "zara", timeactive: 100, full_name: "Zara" }),
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 10, full_name: "Alice" }),
      makeEntry({ id: "2025-01-06", studentid: "mike", timeactive: 50, full_name: "Mike" })
    ];
    const model = new BaseCalendarModel(entries, null);
    // Per-student totals: alice=10, mike=50, zara=100
    // Sorted: [10, 50, 100] -> median = 50
    expect(model.medianByDay.row!.totalSeconds).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Survivor #13: dateMedian > 0 and weekSum > 0 conditions in buildMedianByWeek
//
// weekSum > 0 -> true: If zero-sum weeks are included in allWeekSums,
// the median changes (e.g., median([0, 50]) = 25 vs median([50]) = 50).
// ---------------------------------------------------------------------------
describe("BaseCalendarModel weekSum > 0 guard in buildMedianByWeek", () => {
  it("medianByWeek totalSeconds excludes zero-sum weeks from median computation", () => {
    // Week 1 (2025-01-06): timeactive = 0 -> dateMedian = 0
    // Week 2 (2025-01-13): timeactive = 50 -> dateMedian = 50
    // With weekSum > 0: allWeekSums = [50], totalSeconds = 50
    // With weekSum > 0 -> true: allWeekSums = [0, 50], totalSeconds = 25
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 0, full_name: "A" }),
      makeEntry({ id: "2025-01-13", studentid: "a", timeactive: 50, full_name: "A" })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByWeek.row).not.toBeNull();
    // The zero-sum week should be excluded from the totalSeconds median
    expect(model.medianByWeek.row!.totalSeconds).toBe(50);
  });

  it("medianByWeek per-week values include zero for zero-sum weeks", () => {
    // Verify that the row[weekMonday] is SET to 0 (even though it's excluded
    // from allWeekSums), distinguishing row population from median input.
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 0, full_name: "A" }),
      makeEntry({ id: "2025-01-13", studentid: "a", timeactive: 80, full_name: "A" })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByWeek.row!["2025-01-06"]).toBe(0);
    expect(model.medianByWeek.row!["2025-01-13"]).toBe(80);
    expect(model.medianByWeek.row!.totalSeconds).toBe(80);
  });

  it("medianByWeek with three weeks (two positive, one zero) computes median of positives only", () => {
    // Week 1: 0, Week 2: 40, Week 3: 100
    // With > 0: allWeekSums = [40, 100], median = round((40+100)/2) = 70
    // With true: allWeekSums = [0, 40, 100], median = 40
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 0, full_name: "A" }),
      makeEntry({ id: "2025-01-13", studentid: "a", timeactive: 40, full_name: "A" }),
      makeEntry({ id: "2025-01-20", studentid: "a", timeactive: 100, full_name: "A" })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.medianByWeek.row!.totalSeconds).toBe(70);
  });
});

// ---------------------------------------------------------------------------
// Additional: dateMedian > 0 guard — verify zero-median dates don't
// contribute to week sums.
// ---------------------------------------------------------------------------
describe("BaseCalendarModel dateMedian > 0 guard in buildMedianByWeek", () => {
  it("zero-median dates do not inflate week sums", () => {
    // Two dates in the same week: one with timeactive=0, one with timeactive=60.
    // With dateMedian > 0: only the positive date (60) contributes to the week sum.
    // With dateMedian > 0 -> true: both contribute, but 0+60 = 60 (same).
    // This mutation is equivalent in this case, but the test exercises the path.
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "a", timeactive: 0, full_name: "A" }),
      makeEntry({ id: "2025-01-07", studentid: "a", timeactive: 60, full_name: "A" })
    ];
    const model = new BaseCalendarModel(entries, null);
    // Week of 2025-01-06: sum = 60 (only the positive dateMedian)
    expect(model.medianByWeek.row!["2025-01-06"]).toBe(60);
  });
});

// ---------------------------------------------------------------------------
// Additional: verify buildPivotedRows sorts students for day and week views
// (line 61). Entries arrive in non-alphabetical order; rows must be sorted.
// ---------------------------------------------------------------------------
describe("BaseCalendarModel student sort in pivoted rows", () => {
  it("day view rows are sorted by studentid even when entries arrive in reverse order", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06", studentid: "zara", timeactive: 10, full_name: "Zara" }),
      makeEntry({ id: "2025-01-06", studentid: "alice", timeactive: 20, full_name: "Alice" }),
      makeEntry({ id: "2025-01-06", studentid: "mike", timeactive: 30, full_name: "Mike" })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.day.rows.map((r) => r.studentid)).toEqual(["alice", "mike", "zara"]);
  });

  it("week view rows are sorted by studentid even when entries arrive in reverse order", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-08", studentid: "zara", timeactive: 10, full_name: "Zara" }),
      makeEntry({ id: "2025-01-08", studentid: "alice", timeactive: 20, full_name: "Alice" })
    ];
    const model = new BaseCalendarModel(entries, null);
    expect(model.week.rows.map((r) => r.studentid)).toEqual(["alice", "zara"]);
  });
});
