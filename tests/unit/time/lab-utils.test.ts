import { describe, it, expect } from "vitest";
import {
  extractLabIdentifier,
  extractStepName,
  getDistinctSortedDatesFromRecords,
  toggleLabViewMode
} from "../../../packages/jsr/time/src/utils/lab-utils";
import type { LearningRecord } from "../../../packages/jsr/time/src/types/lab-types";
import type { LabViewMode } from "../../../packages/jsr/time/src/utils/lab-utils";

// ---------------------------------------------------------------------------
// Helper: build a minimal LearningRecord
// ---------------------------------------------------------------------------
function makeRecord(overrides: Partial<LearningRecord> = {}): LearningRecord {
  return {
    course_id: "course-1",
    student_id: "student-1",
    lo_id: "topic/book-lab1/step-01",
    duration: 10,
    count: 1,
    date_last_accessed: "2025-03-15T10:30:00Z",
    type: "lab",
    ...overrides
  };
}

// ===========================================================================
// extractLabIdentifier
// ===========================================================================
describe("extractLabIdentifier", () => {
  it("returns the segment starting with 'book'", () => {
    expect(extractLabIdentifier("topic/book-lab1/step-01")).toBe("book-lab1");
  });

  it("returns the first 'book' segment when multiple exist", () => {
    expect(extractLabIdentifier("topic/book-first/book-second/step")).toBe("book-first");
  });

  it("is case-insensitive for the 'book' prefix", () => {
    expect(extractLabIdentifier("topic/Book-Lab2/step-01")).toBe("Book-Lab2");
  });

  it("handles uppercase BOOK prefix", () => {
    expect(extractLabIdentifier("topic/BOOK-lab3/step-01")).toBe("BOOK-lab3");
  });

  it("returns the full loId when no segment starts with 'book'", () => {
    expect(extractLabIdentifier("topic/talk-1/unit-01")).toBe("topic/talk-1/unit-01");
  });

  it("handles a single-segment path starting with 'book'", () => {
    expect(extractLabIdentifier("book-standalone")).toBe("book-standalone");
  });

  it("handles a single-segment path not starting with 'book'", () => {
    expect(extractLabIdentifier("talk-standalone")).toBe("talk-standalone");
  });

  it("trims whitespace around segments", () => {
    expect(extractLabIdentifier("topic/ book-lab1 /step-01")).toBe("book-lab1");
  });

  it("handles empty string", () => {
    expect(extractLabIdentifier("")).toBe("");
  });
});

// ===========================================================================
// extractStepName
// ===========================================================================
describe("extractStepName", () => {
  it("returns the last segment of a multi-segment path", () => {
    expect(extractStepName("topic/book-lab1/step-01")).toBe("step-01");
  });

  it("returns the only segment for a single-segment path", () => {
    expect(extractStepName("step-only")).toBe("step-only");
  });

  it("ignores trailing slashes (empty segments)", () => {
    expect(extractStepName("topic/book-lab1/step-01/")).toBe("step-01");
  });

  it("ignores leading slashes", () => {
    expect(extractStepName("/topic/book-lab1/step-02")).toBe("step-02");
  });

  it("returns the original string for empty input", () => {
    expect(extractStepName("")).toBe("");
  });

  it("handles whitespace-only segments by filtering them out", () => {
    expect(extractStepName("topic/ /step-03")).toBe("step-03");
  });

  it("handles deeply nested paths", () => {
    expect(extractStepName("a/b/c/d/e/final-step")).toBe("final-step");
  });
});

// ===========================================================================
// getDistinctSortedDatesFromRecords
// ===========================================================================
describe("getDistinctSortedDatesFromRecords", () => {
  it("returns distinct sorted dates from records", () => {
    const records = [
      makeRecord({ date_last_accessed: "2025-03-15T10:00:00Z" }),
      makeRecord({ date_last_accessed: "2025-03-10T08:00:00Z" }),
      makeRecord({ date_last_accessed: "2025-03-15T14:00:00Z" })
    ];
    expect(getDistinctSortedDatesFromRecords(records)).toEqual([
      "2025-03-10",
      "2025-03-15"
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(getDistinctSortedDatesFromRecords([])).toEqual([]);
  });

  it("places records without date_last_accessed at the end as __no_date__", () => {
    const records = [
      makeRecord({ date_last_accessed: "2025-03-15T10:00:00Z" }),
      makeRecord({ date_last_accessed: null })
    ];
    const result = getDistinctSortedDatesFromRecords(records);
    expect(result[result.length - 1]).toBe("__no_date__");
    expect(result[0]).toBe("2025-03-15");
  });

  it("produces a single __no_date__ entry even for multiple records without dates", () => {
    const records = [
      makeRecord({ date_last_accessed: null }),
      makeRecord({ date_last_accessed: null }),
      makeRecord({ date_last_accessed: undefined })
    ];
    const result = getDistinctSortedDatesFromRecords(records);
    expect(result).toEqual(["__no_date__"]);
  });

  it("filters out records with null lo_id", () => {
    const records = [
      makeRecord({ lo_id: null, date_last_accessed: "2025-03-15T10:00:00Z" }),
      makeRecord({ lo_id: "topic/book-1/step-1", date_last_accessed: "2025-03-10T10:00:00Z" })
    ];
    expect(getDistinctSortedDatesFromRecords(records)).toEqual(["2025-03-10"]);
  });

  it("returns empty array when all records have null lo_id", () => {
    const records = [
      makeRecord({ lo_id: null }),
      makeRecord({ lo_id: null })
    ];
    expect(getDistinctSortedDatesFromRecords(records)).toEqual([]);
  });

  it("sorts dates chronologically across months and years", () => {
    const records = [
      makeRecord({ date_last_accessed: "2026-01-05T10:00:00Z" }),
      makeRecord({ date_last_accessed: "2025-12-20T10:00:00Z" }),
      makeRecord({ date_last_accessed: "2025-06-01T10:00:00Z" })
    ];
    expect(getDistinctSortedDatesFromRecords(records)).toEqual([
      "2025-06-01",
      "2025-12-20",
      "2026-01-05"
    ]);
  });

  it("returns single date for single record", () => {
    const records = [makeRecord({ date_last_accessed: "2025-07-04T12:00:00Z" })];
    expect(getDistinctSortedDatesFromRecords(records)).toEqual(["2025-07-04"]);
  });
});

// ===========================================================================
// toggleLabViewMode
// ===========================================================================
describe("toggleLabViewMode", () => {
  it("toggles 'lab' to 'step'", () => {
    expect(toggleLabViewMode("lab")).toBe("step");
  });

  it("toggles 'step' to 'lab'", () => {
    expect(toggleLabViewMode("step")).toBe("lab");
  });

  it("round-trips back to original", () => {
    const start: LabViewMode = "lab";
    expect(toggleLabViewMode(toggleLabViewMode(start))).toBe(start);
  });
});
