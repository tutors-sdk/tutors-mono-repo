/** Calendar entry used by the app. Raw DB rows omit full_name (enriched at load). */
export interface CalendarEntry {
  id: string; // DATE as string (YYYY-MM-DD format)
  studentid: string; // raw student identifier (e.g. github_id)
  courseid: string;
  timeactive: number; // minutes (converted from 30-second blocks at load)
  pageloads: number; // BIGINT
  full_name: string; // display name from TutorsConnectUser (falls back to studentid when missing)
}

/** Pivoted per-student row for calendar grids (day/week view). */
export type CalendarRow = {
  courseid: string;
  studentid: string;
  full_name: string;
  totalSeconds: number;
  [key: string]: string | number;
};

/** Median row for calendar grids (one row with medians per date or week). */
export type CalendarMedianRow = { courseid: string; totalSeconds: number; [key: string]: string | number };

/** Prepared rows for the day/week calendar grid (pivoted per student). */
export type CalendarTable = {
  rows: CalendarRow[];
};

/** Prepared row for the median grid (medians per date or week). */
export type CalendarMedianTable = {
  row: CalendarMedianRow | null;
};

/** Calendar model interface for course/student views. */
export interface CalendarModel {
  readonly day: CalendarTable;
  readonly week: CalendarTable;
  readonly medianByDay: CalendarMedianTable;
  readonly medianByWeek: CalendarMedianTable;
  readonly weeks: string[];
  readonly dates: string[];
  readonly error: string | null;
}
