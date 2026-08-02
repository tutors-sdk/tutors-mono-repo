import { describe, it, expect } from "vitest";
import {
  filterByDateRange,
  getMondayForDate
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
// filterByDateRange boundary tests
// ===========================================================================
describe("filterByDateRange boundary tests", () => {
  const entries: CalendarEntry[] = [
    makeEntry({ id: "2025-01-01" }),
    makeEntry({ id: "2025-01-15" }),
    makeEntry({ id: "2025-02-01" }),
    makeEntry({ id: "2025-06-30" }),
    makeEntry({ id: "2025-12-31" })
  ];

  it("includes entry exactly on start date (inclusive start)", () => {
    const result = filterByDateRange(entries, "2025-01-15", "2025-12-31");
    expect(result.map((e) => e.id)).toContain("2025-01-15");
  });

  it("includes entry exactly on end date (inclusive end)", () => {
    const result = filterByDateRange(entries, "2025-01-01", "2025-01-15");
    expect(result.map((e) => e.id)).toContain("2025-01-15");
  });

  it("single-day range returns only that date", () => {
    const result = filterByDateRange(entries, "2025-01-15", "2025-01-15");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2025-01-15");
  });

  it("cross-month range works correctly", () => {
    const result = filterByDateRange(entries, "2025-01-20", "2025-02-15");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("2025-02-01");
  });

  it("cross-year range includes entries from both years", () => {
    const multiYearEntries: CalendarEntry[] = [
      makeEntry({ id: "2024-12-15" }),
      makeEntry({ id: "2024-12-31" }),
      makeEntry({ id: "2025-01-01" }),
      makeEntry({ id: "2025-01-15" })
    ];
    const result = filterByDateRange(multiYearEntries, "2024-12-20", "2025-01-10");
    expect(result).toHaveLength(2);
    expect(result.map((e) => e.id)).toEqual(["2024-12-31", "2025-01-01"]);
  });

  it("end date before start date returns empty (no entries in inverted range)", () => {
    const result = filterByDateRange(entries, "2025-06-01", "2025-01-01");
    expect(result).toEqual([]);
  });
});

// ===========================================================================
// getMondayForDate for every day of the week
// ===========================================================================
describe("getMondayForDate for every day of the week", () => {
  // Week of 2025-01-06 (Monday) to 2025-01-12 (Sunday)
  it("Monday 2025-01-06 -> 2025-01-06", () => {
    expect(getMondayForDate("2025-01-06")).toBe("2025-01-06");
  });

  it("Tuesday 2025-01-07 -> 2025-01-06", () => {
    expect(getMondayForDate("2025-01-07")).toBe("2025-01-06");
  });

  it("Wednesday 2025-01-08 -> 2025-01-06", () => {
    expect(getMondayForDate("2025-01-08")).toBe("2025-01-06");
  });

  it("Thursday 2025-01-09 -> 2025-01-06", () => {
    expect(getMondayForDate("2025-01-09")).toBe("2025-01-06");
  });

  it("Friday 2025-01-10 -> 2025-01-06", () => {
    expect(getMondayForDate("2025-01-10")).toBe("2025-01-06");
  });

  it("Saturday 2025-01-11 -> 2025-01-06", () => {
    expect(getMondayForDate("2025-01-11")).toBe("2025-01-06");
  });

  it("Sunday 2025-01-12 -> 2025-01-06", () => {
    expect(getMondayForDate("2025-01-12")).toBe("2025-01-06");
  });
});

// ===========================================================================
// getMondayForDate at month/year boundaries
// ===========================================================================
describe("getMondayForDate at month/year boundaries", () => {
  it("Sunday Jan 5 2025 -> Monday Dec 30 2024 (crosses year boundary)", () => {
    expect(getMondayForDate("2025-01-05")).toBe("2024-12-30");
  });

  it("Saturday Jan 4 2025 -> Monday Dec 30 2024", () => {
    expect(getMondayForDate("2025-01-04")).toBe("2024-12-30");
  });

  it("Wednesday Jan 1 2025 -> Monday Dec 30 2024", () => {
    expect(getMondayForDate("2025-01-01")).toBe("2024-12-30");
  });

  it("Sunday March 2 2025 -> Monday Feb 24 2025 (crosses month boundary)", () => {
    expect(getMondayForDate("2025-03-02")).toBe("2025-02-24");
  });

  it("Saturday March 1 2025 -> Monday Feb 24 2025", () => {
    expect(getMondayForDate("2025-03-01")).toBe("2025-02-24");
  });
});
