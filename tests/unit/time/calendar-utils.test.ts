import { describe, it, expect } from "vitest";
import {
  filterByDateRange,
  getDistinctSortedDates,
  formatDateShort,
  formatTimeNearestMinute,
  formatTimeMinutesOnly,
  cellColorForMinutes,
  getMondayForDate,
  getDistinctSortedWeeks
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
// filterByDateRange
// ===========================================================================
describe("filterByDateRange", () => {
  const entries: CalendarEntry[] = [
    makeEntry({ id: "2025-01-01" }),
    makeEntry({ id: "2025-01-15" }),
    makeEntry({ id: "2025-02-01" }),
    makeEntry({ id: "2025-03-01" })
  ];

  it("returns all entries when no bounds specified", () => {
    const result = filterByDateRange(entries, null, null);
    expect(result).toEqual(entries);
  });

  it("filters with start date only", () => {
    const result = filterByDateRange(entries, "2025-01-15", null);
    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("2025-01-15");
  });

  it("filters with end date only", () => {
    const result = filterByDateRange(entries, null, "2025-01-15");
    expect(result).toHaveLength(2);
    expect(result[1].id).toBe("2025-01-15");
  });

  it("filters with both bounds (inclusive)", () => {
    const result = filterByDateRange(entries, "2025-01-15", "2025-02-01");
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(["2025-01-15", "2025-02-01"]);
  });

  it("returns empty array when input is empty", () => {
    const result = filterByDateRange([], "2025-01-01", "2025-12-31");
    expect(result).toEqual([]);
  });

  it("returns empty when range excludes all entries", () => {
    const result = filterByDateRange(entries, "2026-01-01", "2026-12-31");
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// getDistinctSortedDates
// ===========================================================================
describe("getDistinctSortedDates", () => {
  it("removes duplicates and sorts ascending", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-15" }),
      makeEntry({ id: "2025-01-01" }),
      makeEntry({ id: "2025-01-15" }),
      makeEntry({ id: "2025-01-10" })
    ];
    expect(getDistinctSortedDates(entries)).toEqual([
      "2025-01-01",
      "2025-01-10",
      "2025-01-15"
    ]);
  });

  it("returns empty array for empty entries", () => {
    expect(getDistinctSortedDates([])).toEqual([]);
  });

  it("returns single date for single entry", () => {
    expect(getDistinctSortedDates([makeEntry({ id: "2025-06-15" })])).toEqual(["2025-06-15"]);
  });
});

// ===========================================================================
// formatDateShort
// ===========================================================================
describe("formatDateShort", () => {
  it("formats 2025-02-03 as 3/2/25", () => {
    expect(formatDateShort("2025-02-03")).toBe("3/2/25");
  });

  it("formats 2025-12-25 as 25/12/25", () => {
    expect(formatDateShort("2025-12-25")).toBe("25/12/25");
  });

  it("formats single-digit day and month without padding", () => {
    expect(formatDateShort("2025-01-05")).toBe("5/1/25");
  });
});

// ===========================================================================
// formatTimeNearestMinute
// ===========================================================================
describe("formatTimeNearestMinute", () => {
  it("formats 0 as '0'", () => {
    expect(formatTimeNearestMinute(0)).toBe("0");
  });

  it("formats 45 as '45'", () => {
    expect(formatTimeNearestMinute(45)).toBe("45");
  });

  it("formats 90 as '1h 30'", () => {
    expect(formatTimeNearestMinute(90)).toBe("1h 30");
  });

  it("formats 120 as '2h 0'", () => {
    expect(formatTimeNearestMinute(120)).toBe("2h 0");
  });

  it("formats 59 as '59' (under one hour)", () => {
    expect(formatTimeNearestMinute(59)).toBe("59");
  });

  it("formats 60 as '1h 0'", () => {
    expect(formatTimeNearestMinute(60)).toBe("1h 0");
  });
});

// ===========================================================================
// formatTimeMinutesOnly
// ===========================================================================
describe("formatTimeMinutesOnly", () => {
  it("formats 90 as '90'", () => {
    expect(formatTimeMinutesOnly(90)).toBe("90");
  });

  it("formats 0 as '0'", () => {
    expect(formatTimeMinutesOnly(0)).toBe("0");
  });

  it("formats 120 as '120'", () => {
    expect(formatTimeMinutesOnly(120)).toBe("120");
  });
});

// ===========================================================================
// cellColorForMinutes
// ===========================================================================
describe("cellColorForMinutes", () => {
  it("returns white for 0 minutes", () => {
    expect(cellColorForMinutes(0)).toBe("rgb(255, 255, 255)");
  });

  it("returns white for null", () => {
    expect(cellColorForMinutes(null)).toBe("rgb(255, 255, 255)");
  });

  it("returns white for undefined", () => {
    expect(cellColorForMinutes(undefined)).toBe("rgb(255, 255, 255)");
  });

  it("returns a green-range color for 100 minutes", () => {
    const color = cellColorForMinutes(100);
    // 100 is in the 1-200 range (light green to deep green)
    // t = (100-1)/199 ~ 0.497
    // Should have low r, mid-high g, low b
    expect(color).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    const [r, g] = color.match(/\d+/g)!.map(Number);
    expect(r).toBeLessThan(150); // Moving toward deep green (r=0)
    expect(g).toBeGreaterThan(150); // Still green
  });

  it("returns a transition color for 300 minutes", () => {
    const color = cellColorForMinutes(300);
    // 300 is in 200-400 range (deep green to light red)
    expect(color).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });

  it("returns a red-range color for 600 minutes", () => {
    const color = cellColorForMinutes(600);
    // 600 is in 400-800 range (light red to deep red)
    expect(color).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
    const [r, g] = color.match(/\d+/g)!.map(Number);
    expect(r).toBeGreaterThan(180); // Red-ish
    expect(g).toBeLessThan(100); // Low green
  });

  it("returns white for negative values", () => {
    expect(cellColorForMinutes(-10)).toBe("rgb(255, 255, 255)");
  });
});

// ===========================================================================
// getMondayForDate
// ===========================================================================
describe("getMondayForDate", () => {
  it("returns Monday for a Wednesday (2025-01-08 -> 2025-01-06)", () => {
    expect(getMondayForDate("2025-01-08")).toBe("2025-01-06");
  });

  it("returns previous Monday for a Sunday (2025-01-05 -> 2024-12-30)", () => {
    expect(getMondayForDate("2025-01-05")).toBe("2024-12-30");
  });

  it("returns the same day when input is already a Monday", () => {
    expect(getMondayForDate("2025-01-06")).toBe("2025-01-06");
  });

  it("handles Saturday correctly", () => {
    // 2025-01-11 is Saturday -> Monday 2025-01-06
    expect(getMondayForDate("2025-01-11")).toBe("2025-01-06");
  });
});

// ===========================================================================
// getDistinctSortedWeeks
// ===========================================================================
describe("getDistinctSortedWeeks", () => {
  it("entries on different days of same week produce one Monday", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-06" }), // Monday
      makeEntry({ id: "2025-01-08" }), // Wednesday
      makeEntry({ id: "2025-01-10" })  // Friday
    ];
    expect(getDistinctSortedWeeks(entries)).toEqual(["2025-01-06"]);
  });

  it("entries from multiple weeks are sorted ascending", () => {
    const entries: CalendarEntry[] = [
      makeEntry({ id: "2025-01-20" }), // Week of Jan 20
      makeEntry({ id: "2025-01-06" }), // Week of Jan 6
      makeEntry({ id: "2025-01-13" })  // Week of Jan 13
    ];
    expect(getDistinctSortedWeeks(entries)).toEqual([
      "2025-01-06",
      "2025-01-13",
      "2025-01-20"
    ]);
  });

  it("returns empty array for empty entries", () => {
    expect(getDistinctSortedWeeks([])).toEqual([]);
  });
});
