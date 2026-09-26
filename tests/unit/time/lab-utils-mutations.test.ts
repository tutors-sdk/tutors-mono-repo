import { describe, it, expect } from "vitest";
import {
  extractStepName,
  getDistinctSortedDatesFromRecords,
} from "../../../packages/jsr/time/src/utils/lab-utils.ts";
import type { LearningRecord } from "../../../packages/jsr/time/src/types/lab-types.ts";

function rec(date: unknown, lo_id: string | null = "t/book-1/s1"): LearningRecord {
  return {
    course_id: "c",
    student_id: "s",
    lo_id,
    duration: 1,
    count: 1,
    date_last_accessed: date as string | null,
    type: "lab",
  };
}

describe("extractStepName", () => {
  it("ignores a trailing slash and blank segments", () => {
    expect(extractStepName("t/book-1/step-2/")).toBe("step-2");
    expect(extractStepName("t/book-1/step-2/  ")).toBe("step-2");
  });
  it("falls back to the input when every segment is blank", () => {
    expect(extractStepName("//")).toBe("//");
  });
});

describe("getDistinctSortedDatesFromRecords ordering", () => {
  const nd = "__no_date__";
  it("sorts dates ascending and puts the no-date key last, whatever the input order", () => {
    const inputs = [
      [rec(null), rec("2024-01-03T00:00:00Z"), rec("2024-01-01T00:00:00Z")],
      [rec("2024-01-03T00:00:00Z"), rec(null), rec("2024-01-01T00:00:00Z")],
      [rec("2024-01-03T00:00:00Z"), rec("2024-01-01T00:00:00Z"), rec(null)],
      [rec("2024-01-01T00:00:00Z"), rec(null), rec("2024-01-03T00:00:00Z")],
    ];
    for (const records of inputs) {
      expect(getDistinctSortedDatesFromRecords(records)).toEqual(["2024-01-01", "2024-01-03", nd]);
    }
  });
  it("sorts several dates without a no-date entry", () => {
    const records = [rec("2024-02-10T00:00:00Z"), rec("2023-12-31T00:00:00Z"), rec("2024-01-05T00:00:00Z")];
    expect(getDistinctSortedDatesFromRecords(records)).toEqual(["2023-12-31", "2024-01-05", "2024-02-10"]);
  });
  it("skips records without a lo_id", () => {
    expect(getDistinctSortedDatesFromRecords([rec("2024-01-01T00:00:00Z", null)])).toEqual([]);
  });
  it("maps a date value that cannot be converted to the no-date key", () => {
    // A Symbol makes the Date constructor throw, exercising the defensive catch.
    expect(getDistinctSortedDatesFromRecords([rec(Symbol("bad"))])).toEqual([nd]);
  });
});
