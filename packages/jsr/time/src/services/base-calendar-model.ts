import type {
  CalendarEntry,
  CalendarRow,
  CalendarMedianRow,
  CalendarModel,
  CalendarTable,
  CalendarMedianTable
} from "../types/index.ts";
import {
  getDistinctSortedWeeks,
  getDistinctSortedDates,
  getMondayForDate,
  type ViewMode
} from "../utils/index.ts";

export type { CalendarTable, CalendarMedianTable } from "../types/index.ts";

/**
 * Calendar data prepared for CalendarGrid and CalendarMedianGrid.
 * Create an instance from raw entries and pass it to GridCalendarModel for grid display.
 */
export class BaseCalendarModel implements CalendarModel {
  readonly day: CalendarTable;
  readonly week: CalendarTable;
  readonly medianByDay: CalendarMedianTable;
  readonly medianByWeek: CalendarMedianTable;
  readonly weeks: string[];
  readonly dates: string[];
  readonly error: string | null;

  constructor(entries: CalendarEntry[], error: string | null) {
    this.error = error;

    this.weeks = getDistinctSortedWeeks(entries);
    this.dates = getDistinctSortedDates(entries);

    this.day = this.buildDayView(entries);
    this.week = this.buildWeekView(entries);
    this.medianByDay = this.buildMedianByDayView(entries);
    this.medianByWeek = this.buildMedianByWeekView(entries);
  }

  private buildDayView(entries: CalendarEntry[]): CalendarTable {
    return { rows: this.buildPivotedRows(entries, this.weeks, this.dates, "day") };
  }

  private buildWeekView(entries: CalendarEntry[]): CalendarTable {
    return { rows: this.buildPivotedRows(entries, this.weeks, this.dates, "week") };
  }

  /**
   * Build pivoted per-student rows for CalendarGrid, based on viewMode.
   * Each row has studentid, totalSeconds, and a column per week or date.
   */
  private buildPivotedRows(
    entries: CalendarEntry[],
    weeks: string[],
    dates: string[],
    viewMode: ViewMode
  ): CalendarRow[] {
    const students = Array.from(new Set(entries.map((e) => e.studentid))).sort();
    const courseId = entries.length > 0 ? entries[0].courseid : "";
    const nameMap = new Map<string, string>();

    for (const e of entries) {
      if (!nameMap.has(e.studentid)) {
        nameMap.set(e.studentid, e.full_name ?? e.studentid);
      }
    }

    const map = new Map<string, number>();

    if (viewMode === "week") {
      for (const e of entries) {
        const weekMonday = getMondayForDate(e.id);
        const key = `${e.studentid}\t${weekMonday}`;
        map.set(key, (map.get(key) ?? 0) + e.timeactive);
      }
      return students.map((studentid) => {
        let totalSeconds = 0;
        const row: CalendarRow = {
          courseid: courseId,
          studentid,
          full_name: nameMap.get(studentid) ?? studentid,
          totalSeconds: 0
        };
        for (const weekMonday of weeks) {
          const secs = map.get(`${studentid}\t${weekMonday}`) ?? 0;
          row[weekMonday] = secs;
          totalSeconds += secs;
        }
        row.totalSeconds = totalSeconds;
        return row;
      });
    } else {
      for (const e of entries) {
        const key = `${e.studentid}\t${e.id}`;
        map.set(key, (map.get(key) ?? 0) + e.timeactive);
      }
      return students.map((studentid) => {
        let totalSeconds = 0;
        const row: CalendarRow = {
          courseid: courseId,
          studentid,
          full_name: nameMap.get(studentid) ?? studentid,
          totalSeconds: 0
        };
        for (const date of dates) {
          const secs = map.get(`${studentid}\t${date}`) ?? 0;
          row[date] = secs;
          totalSeconds += secs;
        }
        row.totalSeconds = totalSeconds;
        return row;
      });
    }
  }

  private median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const mid = Math.floor(n / 2);
    if (n % 2 === 1) return sorted[mid];
    const lower = sorted[mid - 1];
    const upper = sorted[mid];
    return Math.round((lower + upper) / 2);
  }

  private getMedianForDate(entries: CalendarEntry[], date: string): number {
    const entriesForDate = entries.filter((entry) => entry.id === date);
    if (!entriesForDate.length) return 0;
    const durations = entriesForDate.map((entry) => entry.timeactive ?? 0);
    return this.median(durations);
  }

  private buildMedianByDay(entries: CalendarEntry[], courseid: string, dates: string[]): CalendarMedianRow | null {
    if (!entries.length) return null;
    const row: CalendarMedianRow = { courseid, totalSeconds: 0 };
    for (const date of dates) {
      row[date] = this.getMedianForDate(entries, date);
    }
    const students = Array.from(new Set(entries.map((e) => e.studentid))).sort();
    const totalsByStudent = new Map<string, number>();
    for (const entry of entries) {
      const secs = entry.timeactive ?? 0;
      const current = totalsByStudent.get(entry.studentid) ?? 0;
      totalsByStudent.set(entry.studentid, current + secs);
    }
    const studentTotals = students.map((studentid) => totalsByStudent.get(studentid) ?? 0);
    row.totalSeconds = this.median(studentTotals);
    return row;
  }

  private buildMedianByWeek(medianByDayRow: CalendarMedianRow | null, courseid: string, weeks: string[], dates: string[]): CalendarMedianRow | null {
    if (!medianByDayRow) return null;
    const row: CalendarMedianRow = { courseid, totalSeconds: 0 };
    const sumsByWeek = new Map<string, number>();
    for (const date of dates) {
      const dateMedian = (medianByDayRow[date] as number) ?? 0;
      if (dateMedian > 0) {
        const weekMonday = getMondayForDate(date);
        const currentSum = sumsByWeek.get(weekMonday) ?? 0;
        sumsByWeek.set(weekMonday, currentSum + dateMedian);
      }
    }
    const allWeekSums: number[] = [];
    for (const weekMonday of weeks) {
      const weekSum = sumsByWeek.get(weekMonday) ?? 0;
      row[weekMonday] = weekSum;
      if (weekSum > 0) allWeekSums.push(weekSum);
    }
    row.totalSeconds = this.median(allWeekSums);
    return row;
  }

  private buildMedianByDayView(entries: CalendarEntry[]): CalendarMedianTable {
    const courseid = entries.length > 0 ? entries[0].courseid : "";
    const row = this.buildMedianByDay(entries, courseid, this.dates);
    return { row };
  }

  private buildMedianByWeekView(entries: CalendarEntry[]): CalendarMedianTable {
    const courseid = entries.length > 0 ? entries[0].courseid : "";
    const medianByDayRow = this.medianByDay.row;
    const row = this.buildMedianByWeek(medianByDayRow, courseid, this.weeks, this.dates);
    return { row };
  }
}
