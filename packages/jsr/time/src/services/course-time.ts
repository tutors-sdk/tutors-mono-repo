import type {
  TutorsTimeCourse,
  LearningRecord,
  CalendarEntry,
  CalendarModel,
  LabModel,
  TutorsConnectUser
} from "../types/index.ts";
import { BaseCalendarModel } from "./base-calendar-model.ts";
import { BaseLabModel } from "./base-lab-model.ts";
import { getSupabase } from "./supabase.ts";

export class CourseTime implements TutorsTimeCourse {
  id = "";
  title = "";
  pin: string | null = null;
  data: CalendarEntry[] = [];
  loading = false;
  error: string | null = null;
  learningRecords: LearningRecord[] = [];
  learningRecordsLoading = false;
  learningRecordsError: string | null = null;
  calendarModel!: CalendarModel;
  labsModel!: LabModel;

  /**
   * Load time data for a single course and date range.
   * Populates this instance with course data and returns this.
   */
  async loadTime(
    courseId: string,
    startDate: string | null,
    endDate: string | null,
    title: string
  ): Promise<TutorsTimeCourse> {
    const id = courseId.trim();
    if (!id) throw new Error("Course ID is required");

    try {
      const filteredData = await CourseTime.getCalendarData(id, startDate, endDate);

      let learningRecords: LearningRecord[] = [];
      let learningRecordsError: string | null = null;
      try {
        learningRecords = await CourseTime.getAllLearningRecordsForCourse(id);
      } catch (e) {
        learningRecordsError = e instanceof Error ? e.message : "Failed to load learning records";
      }

      this.id = id;
      this.title = title;
      this.data = filteredData;
      this.loading = false;
      this.error = null;
      this.learningRecords = learningRecords;
      this.learningRecordsLoading = false;
      this.learningRecordsError = learningRecordsError;
      this.calendarModel = new BaseCalendarModel(filteredData, null);
      this.labsModel = new BaseLabModel(learningRecords, learningRecordsError);
      this.pin = await CourseTime.getCoursePin(id);
    } catch (e) {
      throw new Error("Failed to load calendar data");
    }

    return this;
  }

  /**
   * Retrieve learning records from the learning_records table.
   * Filters by student_id, course_id, and type (all required).
   * Returns an empty array if no records are found or on error.
   */
  static async getLearningRecords(
    studentId: string,
    courseId: string,
    type: string
  ): Promise<LearningRecord[]> {
    const supabase = getSupabase();
    let query = supabase
      .from("learning_records")
      .select("*")
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .eq("type", type);

    const { data, error } = await query;

    if (error) {
      console.warn("Failed to fetch learning records", { error: error.message, courseId, type });
      return [];
    }

    return (data as LearningRecord[]) ?? [];
  }

  /**
   * Retrieve calendar data for a given course (or all courses if courseId is not provided),
   * limited to days from startDate to endDate (inclusive, YYYY-MM-DD) when given.
   * The range is applied in the query so only those days leave the database.
   * Enriches entries with student full names from tutors-connect-users.
   * Throws an error if the database query fails.
   */
  static async getCalendarData(
    courseId?: string,
    startDate?: string | null,
    endDate?: string | null
  ): Promise<CalendarEntry[]> {
    const supabase = getSupabase();
    let query = supabase.from("calendar").select("*").order("id", { ascending: true });

    if (courseId) {
      query = query.eq("courseid", courseId);
    }
    if (startDate) {
      query = query.gte("id", startDate);
    }
    if (endDate) {
      query = query.lte("id", endDate);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch calendar data: ${error.message}`);
    }

    const rawEntries = (data as Omit<CalendarEntry, "full_name">[]) ?? [];

    /** Convert timeactive from 30-second blocks to minutes at load */
    const toMinutes = (blocks: number | null | undefined): number =>
      blocks != null ? Math.round((blocks * 30) / 60) : 0;

    // Look up student full names by studentid (github_id in tutors-connect-users)
    const studentIds = Array.from(new Set(rawEntries.map((e) => e.studentid).filter(Boolean)));
    if (!studentIds.length) {
      // No users to look up; fall back to using studentid as full_name
      return rawEntries.map<CalendarEntry>((entry) => ({
        ...entry,
        timeactive: toMinutes(entry.timeactive),
        full_name: entry.studentid
      }));
    }

    const { data: userRows, error: userError } = await supabase
      .from("tutors-connect-users")
      .select("github_id, full_name")
      .in("github_id", studentIds);

    if (userError) {
      // If lookup fails, fall back to raw student IDs
      return rawEntries.map<CalendarEntry>((entry) => ({
        ...entry,
        timeactive: toMinutes(entry.timeactive),
        full_name: entry.studentid
      }));
    }

    const nameMap: Record<string, string> = {};
    for (const row of (userRows ?? []) as TutorsConnectUser[]) {
      const key = row.github_id?.trim();
      if (!key) continue;
      const displayName =
        row.full_name && row.full_name.trim().length > 0 ? row.full_name.trim() : key;
      nameMap[key] = displayName;
    }

    // Attach full_name while preserving raw studentid; timeactive converted to minutes
    return rawEntries.map<CalendarEntry>((entry) => ({
      ...entry,
      timeactive: toMinutes(entry.timeactive),
      full_name: nameMap[entry.studentid] ?? entry.studentid
    }));
  }

  /**
   * Retrieve all learning records for a given course (all students, type="lab").
   * Enriches records with student full names from tutors-connect-users.
   * Throws an error if the database query fails.
   */
  static async getAllLearningRecordsForCourse(courseId: string): Promise<LearningRecord[]> {
    const supabase = getSupabase();
    let query = supabase
      .from("learning_records")
      .select("*")
      .eq("course_id", courseId)
//
      .order("date_last_accessed", { ascending: false });

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch learning records: ${error.message}`);
    }

    let learningRecords: LearningRecord[] = (data as LearningRecord[]) ?? [];

    /** Convert duration from 30-second blocks to minutes at load */
    learningRecords = learningRecords.map((r) => ({
      ...r,
      duration: r.duration != null ? Math.round((r.duration * 30) / 60) : null
    }));

    // Sort learning records: primary key by student_id, secondary key by lo_id
    learningRecords.sort((a, b) => {
      const aStudentId = a.student_id || "";
      const bStudentId = b.student_id || "";
      const studentCompare = aStudentId.localeCompare(bStudentId);
      if (studentCompare !== 0) {
        return studentCompare;
      }
      // If student_id is the same, sort by lo_id
      const aLoId = a.lo_id || "";
      const bLoId = b.lo_id || "";
      return aLoId.localeCompare(bLoId);
    });

    // Enrich learning records with student full names (similar to calendar entries)
    const studentIds = Array.from(new Set(learningRecords.map((r) => r.student_id).filter(Boolean)));
    if (studentIds.length > 0) {
      const { data: userRows, error: userError } = await supabase
        .from("tutors-connect-users")
        .select("github_id, full_name")
        .in("github_id", studentIds);

      if (!userError && userRows) {
        const nameMap: Record<string, string> = {};
        for (const row of userRows as TutorsConnectUser[]) {
          const key = row.github_id?.trim();
          if (!key) continue;
          const displayName =
            row.full_name && row.full_name.trim().length > 0 ? row.full_name.trim() : key;
          nameMap[key] = displayName;
        }

        // Add full_name for display; keep student_id as raw github_id for links
        learningRecords = learningRecords.map((record) => ({
          ...record,
          full_name: nameMap[record.student_id] ?? record.student_id
        }));
      }
    }

    return learningRecords;
  }

  /**
   * Fetch tutors.json from the host that serves the course and extract ignorePin.
   * Returns empty string if fetch fails, JSON is invalid, or ignorePin is missing.
   */
  static async getCoursePin(courseId: string): Promise<string> {
    const id = courseId.trim();
    if (!id) return "";

    try {
      const url = `${courseBaseUrl(id)}/tutors.json`;
      const res = await fetch(url);
      if (!res.ok) return "";

      const data = await res.json();
      const pin = data?.properties?.ignorepin;
      return pin;
    } catch {
      return "";
    }
  }
}

/**
 * Resolve a course id to the base URL that serves it, as the reader does
 * (determineCourseUrl in @tutors/course): a domain or full URL is used as given,
 * localhost or a 192.* address is served over http, and a bare id is a Netlify site.
 */
function courseBaseUrl(id: string): string {
  let host = id;
  // A loop, not /\/+$/: that regex backtracks polynomially on input with many slashes (CodeQL js/polynomial-redos).
  while (host.endsWith("/")) host = host.slice(0, -1);
  if (/^(https?:\/\/)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(:[0-9]+)?(\/.*)?$/.test(host)) {
    return /^https?:\/\//.test(host) ? host : `https://${host}`;
  }
  if (host.startsWith("localhost") || host.startsWith("192")) return `http://${host}`;
  return `https://${host}.netlify.app`;
}
