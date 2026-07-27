import type { LearningRecord, LabModel, LabTable, LabMedianTable, LabRow, LabMedianRow } from "../types/index.ts";
import { extractLabIdentifier } from "../utils/index.ts";

export type { LabTable, LabMedianTable } from "../types/index.ts";

type LabViewMode = "lab" | "step";

const NO_DATE_KEY = "__no_date__";

/**
 * Lab data prepared for LabsGrid.
 * Filters learning records to those with a segment starting with "book", then builds lab and step views.
 */
export class BaseLabModel implements LabModel {
  readonly lab: LabTable;
  readonly step: LabTable;
  readonly medianByLabStep: LabMedianTable;
  readonly medianByLab: LabMedianTable;
  readonly labs: string[];
  readonly steps: string[];
  readonly courseId: string;
  readonly error: string | null;

  constructor(records: LearningRecord[], error: string | null) {
    this.error = error;

    const filtered = this.filterAndSortRecords(records);

    this.courseId = filtered.length > 0 ? filtered[0].course_id : "";
    this.labs = this.getDistinctLabs(filtered);
    this.steps = this.getDistinctLabSteps(filtered);

    this.lab = this.buildLabView(filtered);
    this.step = this.buildStepView(filtered);
    this.medianByLabStep = this.buildMedianByLabStepView(filtered);
    this.medianByLab = this.buildMedianByLabView(filtered);
  }

  /** Build a lab row for a single student with date keys (YYYY-MM-DD). Values in minutes. Use for lab activity heatmap by day. */
  static buildLabRowByDay(
    records: LearningRecord[],
    studentId: string,
    dates: string[],
    fullName: string
  ): LabRow | null {
    const validRecords = records.filter(
      (r) => r.lo_id != null && r.student_id === studentId
    );
    if (!validRecords.length || !dates.length) return null;

    const map = new Map<string, number>();
    for (const r of validRecords) {
      const date = BaseLabModel.getDateFromRecord(r);
      if (date === NO_DATE_KEY) continue;
      map.set(date, (map.get(date) ?? 0) + (r.duration ?? 0));
    }

    let totalMinutes = 0;
    const row: LabRow = { studentid: studentId, full_name: fullName, totalMinutes: 0 };
    for (const date of dates) {
      const mins = map.get(date) ?? 0;
      row[date] = mins;
      totalMinutes += mins;
    }
    row.totalMinutes = totalMinutes;
    return row;
  }

  /** Build median row for lab-by-day view: one row with median duration per date. Values in minutes. */
  static buildMedianByDay(
    records: LearningRecord[],
    courseid: string,
    dates: string[]
  ): LabMedianRow | null {
    const validRecords = records.filter((r) => r.lo_id != null);
    if (!validRecords.length || !dates.length) return null;

    const map = new Map<string, number>();
    for (const r of validRecords) {
      const date = BaseLabModel.getDateFromRecord(r);
      const key = `${r.student_id}\t${date}`;
      map.set(key, (map.get(key) ?? 0) + (r.duration ?? 0));
    }

    const students = Array.from(new Set(validRecords.map((r) => r.student_id))).sort();

    const row: LabMedianRow = { courseid, totalMinutes: 0 };
    for (const date of dates) {
      const values = students.map((s) => map.get(`${s}\t${date}`) ?? 0).filter((v) => v > 0);
      row[date] = BaseLabModel.median(values);
    }

    const totalsByStudent = students.map((s) => {
      let sum = 0;
      for (const date of dates) {
        sum += map.get(`${s}\t${date}`) ?? 0;
      }
      return sum;
    });
    row.totalMinutes = BaseLabModel.median(totalsByStudent);
    return row;
  }

  private static getDateFromRecord(record: LearningRecord): string {
    const d = record.date_last_accessed;
    if (!d) return NO_DATE_KEY;
    try {
      const date = new Date(d);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    } catch {
      return NO_DATE_KEY;
    }
  }

  private static median(values: number[]): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const mid = Math.floor(n / 2);
    if (n % 2 === 1) return sorted[mid];
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  }

  private filterAndSortRecords(records: LearningRecord[]): LearningRecord[] {
    return [...records]
      .sort((a, b) => {
        const aId = a.lo_id ?? "";
        const bId = b.lo_id ?? "";
        return aId.localeCompare(bId);
      })
      .filter((record) => {
        if (!record.lo_id) return false;
        const segments = record.lo_id.split("/");
        return segments.some((s) => s.trim().toLowerCase().startsWith("book"));
      });
  }

  private getDistinctLabSteps(records: LearningRecord[]): string[] {
    return Array.from(
      new Set(
        records
          .map((r) => r.lo_id)
          .filter((lo_id): lo_id is string => lo_id !== null && lo_id !== undefined)
      )
    ).sort();
  }

  private getDistinctLabs(records: LearningRecord[]): string[] {
    const labIdentifiers = Array.from(
      new Set(
        records
          .map((r) => r.lo_id)
          .filter((lo_id): lo_id is string => lo_id !== null && lo_id !== undefined)
          .map(extractLabIdentifier)
      )
    );
    return labIdentifiers;
  }

  private buildLabsPivotedRows(records: LearningRecord[], viewMode: LabViewMode = "step"): LabRow[] {
    const validRecords = records.filter((r) => r.lo_id !== null && r.lo_id !== undefined);

    if (validRecords.length === 0) {
      return [];
    }

    const sortedRecords = [...validRecords].sort((a, b) => {
      const aLoId = a.lo_id || "";
      const bLoId = b.lo_id || "";
      return aLoId.localeCompare(bLoId);
    });

    const students = Array.from(new Set(sortedRecords.map((r) => r.student_id))).sort();

    const columns =
      viewMode === "lab" ? this.getDistinctLabs(sortedRecords) : this.getDistinctLabSteps(sortedRecords);

    const map = new Map<string, number>();
    const nameMap = new Map<string, string>();

    for (const record of sortedRecords) {
      const columnKey = viewMode === "lab" ? extractLabIdentifier(record.lo_id!) : record.lo_id!;
      const key = `${record.student_id}\t${columnKey}`;
      const duration = record.duration ?? 0;
      map.set(key, (map.get(key) ?? 0) + duration);
      if (!nameMap.has(record.student_id)) {
        nameMap.set(record.student_id, record.full_name ?? record.student_id);
      }
    }

    return students.map((studentid) => {
      let totalMinutes = 0;
      const row: LabRow = { studentid, full_name: nameMap.get(studentid) ?? studentid, totalMinutes: 0 };

      for (const columnId of columns) {
        const blocks = map.get(`${studentid}\t${columnId}`) ?? 0;
        row[columnId] = blocks;
        totalMinutes += blocks;
      }

      row.totalMinutes = totalMinutes;
      return row;
    });
  }

  private buildLabView(records: LearningRecord[]): LabTable {
    return { rows: this.buildLabsPivotedRows(records, "lab") };
  }

  private buildStepView(records: LearningRecord[]): LabTable {
    return { rows: this.buildLabsPivotedRows(records, "step") };
  }

  private buildMedianByStep(
    records: LearningRecord[],
    courseid: string,
    steps: string[]
  ): LabMedianRow | null {
    const validRecords = records.filter((r) => r.lo_id != null);
    if (!validRecords.length || !steps.length) return null;

    const pivotedRows = this.buildLabsPivotedRows(validRecords, "step");
    const row: LabMedianRow = { courseid, totalMinutes: 0 };

    for (const stepId of steps) {
      const values = pivotedRows.map((r) => (r[stepId] as number) ?? 0).filter((v) => v > 0);
      row[stepId] = BaseLabModel.median(values);
    }

    const studentTotals = pivotedRows.map((r) => r.totalMinutes);
    row.totalMinutes = BaseLabModel.median(studentTotals);
    return row;
  }

  private buildMedianByLab(
    records: LearningRecord[],
    courseid: string,
    labs: string[]
  ): LabMedianRow | null {
    const validRecords = records.filter((r) => r.lo_id != null);
    if (!validRecords.length || !labs.length) return null;

    const labRows = this.buildLabsPivotedRows(validRecords, "lab");
    const row: LabMedianRow = { courseid, totalMinutes: 0 };

    for (const labId of labs) {
      const values = labRows.map((r) => (r[labId] as number) ?? 0).filter((v) => v > 0);
      row[labId] = BaseLabModel.median(values);
    }

    const studentTotals = labRows.map((r) => r.totalMinutes);
    row.totalMinutes = BaseLabModel.median(studentTotals);

    return row;
  }

  private buildMedianByLabStepView(records: LearningRecord[]): LabMedianTable {
    const courseid = records.length > 0 ? records[0].course_id : "";
    const row = this.buildMedianByStep(records, courseid, this.steps);
    return { row };
  }

  private buildMedianByLabView(records: LearningRecord[]): LabMedianTable {
    const courseid = records.length > 0 ? records[0].course_id : "";
    const row = this.buildMedianByLab(records, courseid, this.labs);
    return { row };
  }
}
