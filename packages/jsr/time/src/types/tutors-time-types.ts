import type { CalendarEntry, CalendarRow, CalendarModel } from "./calendar-types.ts";
import type { LabRow, LabModel, LearningRecord, LabMedianRow } from "./lab-types.ts";
import type { TutorsConnectUser } from "./tutors-connect-types.ts";

/** Return type of TutorsTime.getStudentDisplayInfo — full `tutors-connect-users` row shape */
export type StudentDisplayInfo = TutorsConnectUser;

/** Return type of TutorsTime.getCourseDisplayInfo */
export type CourseDisplayInfo = {
  title: string;
  img: string | null;
  icon: { type: string; color: string | null } | null;
};

// Aggregated per-course calendar view used by the grids
export type TutorsTimeCourse = {
  id: string; // original course ID
  title: string; // display title (usually from tutors-connect-courses)
  pin: string | null
  data: CalendarEntry[];
  loading: boolean;
  error: string | null;
  learningRecords: LearningRecord[];
  learningRecordsLoading: boolean;
  learningRecordsError: string | null;
  /** Prepared day/week/summary views for calendar grids. Initialised in loadTime. */
  calendarModel: CalendarModel;
  /** Prepared lab/step views for LabsGrid. Initialised in loadTime. */
  labsModel: LabModel;
  /** Lab median by day (from learning records). Set when dates available (e.g. in student view). */
  labsMedianByDay?: LabMedianRow | null;
  /** Week column names (from calendarModel.week). Set in student view. */
  weeks?: string[];
  /** Date column names (from calendarModel.day). Set in student view. */
  dates?: string[];
  /** Lab column names (from labsModel.labs). Set in student view. */
  labColumns?: string[];
  /** Step column names (from labsModel.steps). Set in student view. */
  stepColumns?: string[];
  /** Load time data for a course and date range. Populates instance and returns it. */
  loadTime?(
    courseId: string,
    startDate: string | null,
    endDate: string | null,
    title: string
  ): Promise<TutorsTimeCourse>;
};

// Single-student calendar view for a given course (extracted from CourseTime)
export type TutorsTimeStudent = {
  courseid: string;
  courseTitle: string;
  studentid: string;
  studentName: string;
  /** Student avatar URL from tutors-connect-users (null if not set or fetch failed) */
  avatarUrl: string | null;
  /** From tutors-connect-users (null if missing or no row) */
  online_status: string | null;
  /** From tutors-connect-users (null if missing or no row) */
  sentiment: string | null;
  /** Loaded course data – use course.calendarModel / course.labsModel for all median values */
  course: TutorsTimeCourse | null;
  /** Student's calendar row (by week view) */
  calendarByWeek: CalendarRow | null;
  /** Student's calendar row (by day view) */
  calendarByDay: CalendarRow | null;
  /** Student's lab row (by lab view) */
  labsByLab: LabRow | null;
  /** Student's lab row (by day) – for lab activity heatmap */
  labsByDay: LabRow | null;
  /** Student's lab row (by step view) */
  labsByStep: LabRow | null;
  error: string | null;
  /** True if student has calendar or lab data */
  hasData: boolean;
};

/**
 * Abstraction for course/calendar and student display services.
 * TutorsTime is the default implementation.
 */
export interface TutorsTimeService {
  getStudentDisplayInfo(studentId: string): Promise<StudentDisplayInfo>;
  getCourseDisplayInfo(courseId: string): Promise<CourseDisplayInfo>;
  loadCourseTime(
    id: string,
    startDate?: string | null,
    endDate?: string | null
  ): Promise<TutorsTimeCourse>;
  loadStudentTime(
    courseId: string,
    studentId: string,
    startDate?: string | null,
    endDate?: string | null
  ): Promise<TutorsTimeStudent>;
}
