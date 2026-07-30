import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

const FUZZ_RUNS = Number(process.env.FUZZ_RUNS) || 200;

interface CalendarEntry {
  id: string;
  studentid: string;
  courseid: string;
  timeactive: number;
  pageloads: number;
}

interface CalendarRow {
  studentid: string;
  totalSeconds: number;
  dates: Record<string, number>;
}

function buildCalendarRows(entries: CalendarEntry[]): CalendarRow[] {
  const map = new Map<string, CalendarRow>();
  for (const e of entries) {
    let row = map.get(e.studentid);
    if (!row) {
      row = { studentid: e.studentid, totalSeconds: 0, dates: {} };
      map.set(e.studentid, row);
    }
    const seconds = e.timeactive * 60;
    row.totalSeconds += seconds;
    row.dates[e.id] = (row.dates[e.id] || 0) + seconds;
  }
  return Array.from(map.values());
}

function computeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

const calendarEntryArb = fc.record({
  id: fc
    .tuple(fc.constant(2024), fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 28 }))
    .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`),
  studentid: fc.stringMatching(/^student-[0-9]{1,3}$/),
  courseid: fc.constant("course-1"),
  timeactive: fc.integer({ min: 0, max: 1440 }),
  pageloads: fc.integer({ min: 0, max: 500 })
});

describe("Calendar Model — Property-Based Tests", () => {
  it("should always produce non-negative time values", () => {
    fc.assert(
      fc.property(fc.array(calendarEntryArb, { maxLength: 50 }), (entries) => {
        const rows = buildCalendarRows(entries);
        for (const row of rows) {
          expect(row.totalSeconds).toBeGreaterThanOrEqual(0);
          for (const val of Object.values(row.dates)) {
            expect(val).toBeGreaterThanOrEqual(0);
          }
        }
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("should produce one row per unique student", () => {
    fc.assert(
      fc.property(fc.array(calendarEntryArb, { maxLength: 50 }), (entries) => {
        const rows = buildCalendarRows(entries);
        const uniqueStudents = new Set(entries.map((e) => e.studentid));
        expect(rows.length).toBe(uniqueStudents.size);
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("should compute totalSeconds as sum of timeactive * 60", () => {
    fc.assert(
      fc.property(fc.array(calendarEntryArb, { maxLength: 50 }), (entries) => {
        const rows = buildCalendarRows(entries);
        for (const row of rows) {
          const studentEntries = entries.filter((e) => e.studentid === row.studentid);
          const expectedTotal = studentEntries.reduce((sum, e) => sum + e.timeactive * 60, 0);
          expect(row.totalSeconds).toBe(expectedTotal);
        }
      }),
      { numRuns: FUZZ_RUNS }
    );
  });

  it("should compute valid medians", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 10000 }), { minLength: 1, maxLength: 100 }), (values) => {
        const median = computeMedian(values);
        expect(median).toBeGreaterThanOrEqual(Math.min(...values));
        expect(median).toBeLessThanOrEqual(Math.max(...values));
        expect(Number.isFinite(median)).toBe(true);
      }),
      { numRuns: FUZZ_RUNS * 2.5 }
    );
  });

  it("should return empty array for empty input", () => {
    const rows = buildCalendarRows([]);
    expect(rows).toEqual([]);
  });

  it("should sum duplicate date entries for the same student", () => {
    fc.assert(
      fc.property(
        fc.record({
          studentid: fc.constant("student-1"),
          date: fc.constant("2024-01-15"),
          time1: fc.integer({ min: 0, max: 720 }),
          time2: fc.integer({ min: 0, max: 720 })
        }),
        ({ studentid, date, time1, time2 }) => {
          const entries: CalendarEntry[] = [
            { id: date, studentid, courseid: "course-1", timeactive: time1, pageloads: 1 },
            { id: date, studentid, courseid: "course-1", timeactive: time2, pageloads: 1 }
          ];
          const rows = buildCalendarRows(entries);
          expect(rows).toHaveLength(1);
          expect(rows[0].dates[date]).toBe((time1 + time2) * 60);
        }
      ),
      { numRuns: FUZZ_RUNS }
    );
  });
});
