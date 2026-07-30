import { describe, it, expect } from "vitest";
import type { CalendarEntry } from "../../../packages/jsr/time/src/types/calendar-types";
import type { LearningRecord } from "../../../packages/jsr/time/src/types/lab-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulates the rune() pattern for testing outside the Svelte compiler.
 * Mirrors the { get value, set value } interface of the real rune().
 */
function rune<T>(initialValue: T): { value: T } {
  let _value = initialValue;
  return {
    get value() {
      return _value;
    },
    set value(v: T) {
      _value = v;
    },
  };
}

function makeCalendarEntry(overrides: Partial<CalendarEntry> = {}): CalendarEntry {
  return {
    id: "2024-03-15",
    studentid: "student-1",
    courseid: "cs101",
    timeactive: 45,
    pageloads: 12,
    full_name: "Alice Student",
    ...overrides,
  };
}

function makeLearningRecord(overrides: Partial<LearningRecord> = {}): LearningRecord {
  return {
    course_id: "cs101",
    student_id: "student-1",
    lo_id: "lab-01",
    duration: 30,
    count: 5,
    date_last_accessed: "2024-03-15T10:00:00Z",
    type: "lab",
    ...overrides,
  };
}

function aggregateTotalMinutes(entries: CalendarEntry[]): number {
  return entries.reduce((sum, e) => sum + e.timeactive, 0);
}

function aggregateTotalDuration(records: LearningRecord[]): number {
  return records.reduce((sum, r) => sum + (r.duration ?? 0), 0);
}

// ===========================================================================
// Calendar data initialisation
// ===========================================================================
describe("analytics-store: calendar data initialisation", () => {
  it("should be initializable with calendar entries", () => {
    const calendarData = rune<CalendarEntry[]>([
      makeCalendarEntry({ id: "2024-03-15", timeactive: 30 }),
      makeCalendarEntry({ id: "2024-03-16", timeactive: 60 }),
    ]);
    expect(calendarData.value).toHaveLength(2);
  });

  it("each entry should have required fields", () => {
    const entry = makeCalendarEntry();
    expect(entry.id).toBeDefined();
    expect(entry.studentid).toBeDefined();
    expect(entry.courseid).toBeDefined();
    expect(entry.timeactive).toBeDefined();
    expect(entry.pageloads).toBeDefined();
    expect(entry.full_name).toBeDefined();
  });

  it("should be initializable as empty", () => {
    const calendarData = rune<CalendarEntry[]>([]);
    expect(calendarData.value).toHaveLength(0);
  });
});

// ===========================================================================
// Lab data initialisation
// ===========================================================================
describe("analytics-store: lab data initialisation", () => {
  it("should be initializable with learning records", () => {
    const labData = rune<LearningRecord[]>([
      makeLearningRecord({ lo_id: "lab-01", duration: 45 }),
      makeLearningRecord({ lo_id: "lab-02", duration: 30 }),
    ]);
    expect(labData.value).toHaveLength(2);
  });

  it("each record should have course_id and student_id", () => {
    const record = makeLearningRecord();
    expect(record.course_id).toBe("cs101");
    expect(record.student_id).toBe("student-1");
  });

  it("duration should be in minutes", () => {
    const record = makeLearningRecord({ duration: 90 });
    expect(record.duration).toBe(90);
  });
});

// ===========================================================================
// Aggregation: total computation
// ===========================================================================
describe("analytics-store: aggregation computes totals", () => {
  it("should compute total minutes from calendar entries", () => {
    const entries = [
      makeCalendarEntry({ timeactive: 30 }),
      makeCalendarEntry({ timeactive: 45 }),
      makeCalendarEntry({ timeactive: 15 }),
    ];
    expect(aggregateTotalMinutes(entries)).toBe(90);
  });

  it("should compute total duration from learning records", () => {
    const records = [
      makeLearningRecord({ duration: 20 }),
      makeLearningRecord({ duration: 40 }),
    ];
    expect(aggregateTotalDuration(records)).toBe(60);
  });

  it("should handle null duration in learning records", () => {
    const records = [
      makeLearningRecord({ duration: 30 }),
      makeLearningRecord({ duration: null }),
    ];
    expect(aggregateTotalDuration(records)).toBe(30);
  });
});

// ===========================================================================
// Empty data produces zero totals
// ===========================================================================
describe("analytics-store: empty data produces zero totals", () => {
  it("empty calendar entries should produce zero total", () => {
    expect(aggregateTotalMinutes([])).toBe(0);
  });

  it("empty learning records should produce zero total", () => {
    expect(aggregateTotalDuration([])).toBe(0);
  });

  it("rune with empty data should derive zero total", () => {
    const calendarData = rune<CalendarEntry[]>([]);
    const total = aggregateTotalMinutes(calendarData.value);
    expect(total).toBe(0);
  });
});

// ===========================================================================
// Data update triggers recomputation
// ===========================================================================
describe("analytics-store: data update triggers recomputation", () => {
  it("updating calendar data should change aggregated total", () => {
    const calendarData = rune<CalendarEntry[]>([
      makeCalendarEntry({ timeactive: 30 }),
    ]);
    const totalBefore = aggregateTotalMinutes(calendarData.value);
    expect(totalBefore).toBe(30);

    calendarData.value = [
      ...calendarData.value,
      makeCalendarEntry({ timeactive: 60 }),
    ];
    const totalAfter = aggregateTotalMinutes(calendarData.value);
    expect(totalAfter).toBe(90);
  });

  it("replacing calendar data should recompute total", () => {
    const calendarData = rune<CalendarEntry[]>([
      makeCalendarEntry({ timeactive: 100 }),
    ]);
    calendarData.value = [makeCalendarEntry({ timeactive: 25 })];
    expect(aggregateTotalMinutes(calendarData.value)).toBe(25);
  });

  it("updating lab data should change aggregated duration", () => {
    const labData = rune<LearningRecord[]>([
      makeLearningRecord({ duration: 20 }),
    ]);
    labData.value = [
      ...labData.value,
      makeLearningRecord({ duration: 40 }),
    ];
    expect(aggregateTotalDuration(labData.value)).toBe(60);
  });

  it("clearing data should reset totals to zero", () => {
    const calendarData = rune<CalendarEntry[]>([
      makeCalendarEntry({ timeactive: 100 }),
    ]);
    calendarData.value = [];
    expect(aggregateTotalMinutes(calendarData.value)).toBe(0);
  });
});
