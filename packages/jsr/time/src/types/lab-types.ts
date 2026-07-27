/** Supabase `learning_records` table model (full_name added during enrichment) */
export interface LearningRecord {
  course_id: string; // text not null
  student_id: string; // text not null (github_id, used for links)
  full_name?: string; // added during enrichment from tutors-connect-users
  lo_id: string | null; // text null
  duration: number | null; // minutes (converted from 30-second blocks at load)
  count: number | null; // bigint null
  date_last_accessed: string | null; // timestamptz null (ISO string)
  type: string | null; // text null
}

/** Pivoted row type for LabsGrid. */
export type LabRow = {
  studentid: string; // raw github_id (for links)
  full_name: string; // display name (from enrichment)
  totalMinutes: number;
  [lo_id: string]: string | number;
};

/** Summary row type for labs median grid (one row, median values per lab or step). */
export type LabMedianRow = {
  courseid: string;
  totalMinutes: number;
  [key: string]: string | number;
};

/** Prepared rows for the lab/step grid (pivoted per student). */
export type LabTable = {
  rows: LabRow[];
};

/** Prepared row for the labs median grid (medians per lab or step). */
export type LabMedianTable = {
  row: LabMedianRow | null;
};

/** Lab model interface for course/student views. */
export interface LabModel {
  readonly lab: LabTable;
  readonly step: LabTable;
  readonly medianByLabStep: LabMedianTable;
  readonly medianByLab: LabMedianTable;
  readonly labs: string[];
  readonly steps: string[];
  readonly courseId: string;
  readonly error: string | null;
}
