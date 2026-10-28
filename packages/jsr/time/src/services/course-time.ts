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
import { getTutorsTimeSource, type TutorsTimeRows } from "./source.ts";

function displayNames(users: Pick<TutorsConnectUser, "github_id" | "full_name">[]): Record<string, string> {
  const names: Record<string, string> = {};
  for (const row of users) {
    const key = row.github_id?.trim();
    if (!key) continue;
    names[key] = row.full_name && row.full_name.trim().length > 0 ? row.full_name.trim() : key;
  }
  return names;
}

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
      const rows = await getTutorsTimeSource().courseRows(id, startDate, endDate);
      const filteredData = CourseTime.calendarEntries(rows);

      let learningRecords: LearningRecord[] = [];
      let learningRecordsError: string | null = null;
      try {
        learningRecords = CourseTime.learningEntries(rows);
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

  static async getLearningRecords(
    studentId: string,
    courseId: string,
    type: string
  ): Promise<LearningRecord[]> {
    try {
      const rows = await getTutorsTimeSource().courseRows(courseId);
      return (rows.learningRecords as unknown as LearningRecord[]).filter((r) => r.student_id === studentId && r.type === type);
    } catch (e) {
      console.warn("Failed to fetch learning records", { error: e instanceof Error ? e.message : String(e), courseId, type });
      return [];
    }
  }

  static async getCalendarData(courseId: string, startDate?: string | null, endDate?: string | null): Promise<CalendarEntry[]> {
    return CourseTime.calendarEntries(await getTutorsTimeSource().courseRows(courseId, startDate, endDate));
  }

  private static calendarEntries(rows: TutorsTimeRows): CalendarEntry[] {
    const rawEntries = (rows.calendar as unknown as Omit<CalendarEntry, "full_name">[]).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const names = displayNames(rows.users);

    /** Convert timeactive from 30-second blocks to minutes at load */
    const toMinutes = (blocks: number | null | undefined): number =>
      blocks != null ? Math.round((blocks * 30) / 60) : 0;

    // Attach full_name while preserving raw studentid; timeactive converted to minutes
    return rawEntries.map<CalendarEntry>((entry) => ({
      ...entry,
      timeactive: toMinutes(entry.timeactive),
      full_name: names[entry.studentid] ?? entry.studentid
    }));
  }

  static async getAllLearningRecordsForCourse(courseId: string): Promise<LearningRecord[]> {
    return CourseTime.learningEntries(await getTutorsTimeSource().courseRows(courseId));
  }

  private static learningEntries(rows: TutorsTimeRows): LearningRecord[] {
    const names = displayNames(rows.users);

    /** Convert duration from 30-second blocks to minutes at load */
    const learningRecords = (rows.learningRecords as unknown as LearningRecord[]).map((r) => ({
      ...r,
      duration: r.duration != null ? Math.round((r.duration * 30) / 60) : null,
      full_name: names[r.student_id] ?? r.student_id
    }));

    // Sort learning records: primary key by student_id, secondary key by lo_id
    learningRecords.sort((a, b) => {
      const studentCompare = (a.student_id || "").localeCompare(b.student_id || "");
      if (studentCompare !== 0) return studentCompare;
      return (a.lo_id || "").localeCompare(b.lo_id || "");
    });

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
