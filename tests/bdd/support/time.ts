import type { CalendarEntry } from "../../../packages/jsr/time/src/types/calendar-types.ts";
import type { LearningRecord } from "../../../packages/jsr/time/src/types/lab-types.ts";

/**
 * Builders for the analytics features: a scenario's data table describes the
 * rows the time app reads from Supabase, and the steps hand those rows to the
 * real `BaseCalendarModel` / `BaseLabModel`. Nothing here computes a result.
 *
 * Calendar ids are plain YYYY-MM-DD strings, as the `calendar` table stores
 * them, so a scenario reads the same in every timezone.
 */

const COURSE_ID = "web-dev-101";

/** One Gherkin data-table row: header → cell text. */
export type TableRow = Record<string, string>;

function calendarEntry(student: string, date: string, minutes: number): CalendarEntry {
  return { id: date, studentid: student, courseid: COURSE_ID, timeactive: minutes, pageloads: 1, full_name: student };
}

/** Rows of `| student | date | minutes |`. */
export function calendarEntries(table: TableRow[]): CalendarEntry[] {
  return table.map((row) => calendarEntry(row.student, row.date, Number(row.minutes)));
}

/**
 * A wide table, `| student | <date> | <date> | … |`, one cell per student per
 * day. An empty cell means the student has no calendar entry for that day.
 */
export function calendarEntriesByStudent(table: TableRow[]): CalendarEntry[] {
  return table.flatMap((row) =>
    Object.entries(row)
      .filter(([column, cell]) => column !== "student" && cell.trim() !== "")
      .map(([date, cell]) => calendarEntry(row.student, date, Number(cell)))
  );
}

/** The lo_id the reader records for a lab step: the lab is the path segment starting with "book". */
function stepLoId(lab: string, step: string): string {
  return `/lab/${COURSE_ID}/topic-01/${lab}/${step}`;
}

function labRecord(student: string, lab: string, step: string, minutes: number): LearningRecord {
  return {
    course_id: COURSE_ID,
    student_id: student,
    full_name: student,
    lo_id: stepLoId(lab, step),
    duration: minutes,
    count: 1,
    date_last_accessed: "2025-01-06T12:00:00.000Z",
    type: "lab"
  };
}

/** Rows of `| student | lab | step | minutes |`. */
export function labRecords(table: TableRow[]): LearningRecord[] {
  return table.map((row) => labRecord(row.student, row.lab, row.step, Number(row.minutes)));
}

/** The `{number}` columns of a pivoted grid row, in the order the scenario names them. */
export function cells(row: Record<string, string | number> | null | undefined, columns: string[]): number[] {
  return columns.map((column) => row?.[column] as number);
}

/** A scenario names a step column as `<lab>/<step>`; the grid keys it by the full lo_id. */
export function stepColumn(label: string): string {
  const [lab, step] = label.split("/");
  return stepLoId(lab, step);
}

/**
 * A wide table, `| student | <lab>/<step> | … |`, one cell per student per
 * step. An empty cell means the student has no learning record for that step.
 */
export function labRecordsByStudent(table: TableRow[]): LearningRecord[] {
  return table.flatMap((row) =>
    Object.entries(row)
      .filter(([column, cell]) => column !== "student" && cell.trim() !== "")
      .map(([column, cell]) => {
        const [lab, step] = column.split("/");
        return labRecord(row.student, lab, step, Number(cell));
      })
  );
}
