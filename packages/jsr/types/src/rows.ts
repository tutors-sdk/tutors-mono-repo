/**
 * Rows of the tables Tutors reads and writes, as stored.
 *
 * These are written by hand from the code that uses them; only `app_errors` has a migration in
 * supabase/migrations. When the schema is in migrations, generated types replace this file (step
 * 5 of guides/SHARED-TYPES.md). Tables with no row type here yet:
 * `tutors_content_locks`, `tutors-connect-profiles`, `assignments`, `assignments_submissions`,
 * `whiteboard_scenes`.
 *
 * Column comments give the Postgres type. Timestamps arrive as ISO strings.
 */

/** `tutors-connect-users`: one row per GitHub user who has signed in. Same shape as time-lib's `TutorsConnectUser`. */
export interface TutorsConnectUserRow {
  github_id: string; // text, primary key
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  /** "online" or "offline" in rows Tutors writes; see `parseSharing`. */
  online_status: string | null;
  date_last_accessed: string | null; // timestamptz
  /** One of `SENTIMENTS` in rows Tutors writes; see `parseSentiment`. */
  sentiment: string | null;
}

/** `tutors-connect-courses`: one row per published course, for the catalogue. Same shape as time-lib's `TutorsConnectCourse`. */
export interface TutorsConnectCourseRow {
  course_id: string;
  visited_at: string; // timestamptz not null
  visit_count: number | null; // bigint
  course_record: {
    title?: string;
    img?: string | null;
    icon?: { type: string; color?: string } | null;
    [key: string]: unknown;
  } | null; // json
}

/** `tutors-connect-latest`: the latest presence snapshot per learner per course. Same shape as community's `TutorsConnectLatestRow`. */
export interface TutorsConnectLatestRow {
  course_id: string;
  student_id: string;
  /** A `PresenceEvent` in rows Tutors writes. */
  payload: Record<string, unknown>;
  received_at: string; // timestamptz
}

/** `calendar`: time and page loads per learner per course per day, as stored (before time-lib converts units). */
export interface CalendarDbRow {
  id: string; // date as YYYY-MM-DD
  studentid: string; // GitHub login
  courseid: string;
  /** Active time in 30-second blocks. */
  timeactive: number;
  pageloads: number; // bigint
}

/** `learning_records`: time and visits per learner per learning object, as stored. */
export interface LearningRecordRow {
  course_id: string;
  student_id: string; // GitHub login
  lo_id: string | null;
  /** Active time in 30-second blocks. */
  duration: number | null;
  count: number | null; // bigint
  date_last_accessed: string | null; // timestamptz
  type: string | null;
}

/** `app_errors`, from supabase/migrations/20260822_create_app_errors.sql. */
export interface AppErrorRow {
  id: string; // uuid
  created_at: string; // timestamptz
  app: string;
  level: "warn" | "error";
  message: string;
  context: Record<string, unknown> | null; // jsonb, default {}
  url: string | null;
  user_agent: string | null;
  course_id: string | null;
  student_id: string | null;
}

/** Table name to row type, for the tables above. */
export interface TutorsTables {
  "tutors-connect-users": TutorsConnectUserRow;
  "tutors-connect-courses": TutorsConnectCourseRow;
  "tutors-connect-latest": TutorsConnectLatestRow;
  calendar: CalendarDbRow;
  learning_records: LearningRecordRow;
  app_errors: AppErrorRow;
}

export type TutorsTableName = keyof TutorsTables;
