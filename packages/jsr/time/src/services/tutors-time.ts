import { CourseTime } from "./course-time.ts";
import { getSupabase } from "./supabase.ts";
import type {
  TutorsTimeStudent,
  TutorsTimeCourse,
  StudentDisplayInfo,
  CourseDisplayInfo,
  TutorsConnectCourse,
  TutorsConnectUser,
  TutorsTimeService
} from "../types/index.ts";
import { BaseLabModel } from "./base-lab-model.ts";

const courseMap = new Map<string, CourseTime>();

function emptyConnectUser(githubId: string): TutorsConnectUser {
  return {
    github_id: githubId,
    email: null,
    full_name: null,
    avatar_url: null,
    online_status: null,
    date_last_accessed: null,
    sentiment: null
  };
}

/** Display name for UI: trimmed full_name when present, otherwise github_id */
function studentDisplayName(info: StudentDisplayInfo): string {
  const n = info.full_name?.trim();
  return n && n.length > 0 ? n : info.github_id;
}

export const TutorsTime: TutorsTimeService = {
  /** Fetch full `tutors-connect-users` row for app bar and student views. */
  async getStudentDisplayInfo(studentId: string): Promise<StudentDisplayInfo> {
    const id = studentId.trim();
    const supabase = getSupabase();
    const { data } = await supabase
      .from("tutors-connect-users")
      .select("email, full_name, avatar_url, github_id, online_status, date_last_accessed, sentiment")
      .eq("github_id", id)
      .maybeSingle();
    if (!data) {
      return emptyConnectUser(id);
    }
    const row = data as TutorsConnectUser;
    return {
      github_id: row.github_id?.trim() || id,
      email: row.email ?? null,
      full_name: row.full_name ?? null,
      avatar_url: row.avatar_url ?? null,
      online_status: row.online_status ?? null,
      date_last_accessed: row.date_last_accessed ?? null,
      sentiment: row.sentiment ?? null
    };
  },

  /** Return display title, image or icon for a course (for AppBar). */
  async getCourseDisplayInfo(courseId: string): Promise<CourseDisplayInfo> {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from("tutors-connect-courses")
      .select("course_id, course_record")
      .eq("course_id", courseId)
      .maybeSingle();

    if (error || !data) {
      return { title: courseId, img: null, icon: null };
    }

    const row = data as TutorsConnectCourse;
    const id = row.course_id?.trim() || courseId;
    const record = row.course_record;
    const title =
      record?.title && String(record.title).trim().length > 0
        ? String(record.title).trim()
        : id;
    const img =
      record?.img != null && String(record.img).trim().length > 0
        ? String(record.img).trim()
        : null;
    const rawIcon = record?.icon;
    const icon =
      rawIcon != null &&
      typeof rawIcon === "object" &&
      typeof (rawIcon as { type?: unknown }).type === "string" &&
      String((rawIcon as { type: string }).type).trim().length > 0
        ? {
            type: String((rawIcon as { type: string }).type).trim(),
            color:
              typeof (rawIcon as { color?: unknown }).color === "string" &&
              String((rawIcon as { color: string }).color).trim().length > 0
                ? String((rawIcon as { color: string }).color).trim()
                : null
          }
        : null;
    return { title, img, icon };
  },

  /**
   * Load a course calendar by ID. Returns cached CourseTime if already loaded (when no date filter),
   * otherwise creates and loads a new one.
   * Caching only applies when both startDate and endDate are null/undefined.
   */
  async loadCourseTime(
    id: string,
    startDate?: string | null,
    endDate?: string | null
  ): Promise<CourseTime> {
    if (!id) throw new Error("Course ID is required");

    const useCache = (startDate == null || startDate === "") && (endDate == null || endDate === "");
    const normalizedStart = startDate && startDate.trim() ? startDate.trim() : null;
    const normalizedEnd = endDate && endDate.trim() ? endDate.trim() : null;

    if (useCache) {
      const cached = courseMap.get(id);
      if (cached) {
        return cached;
      }
    }

    const { title } = await this.getCourseDisplayInfo(id);
    const courseTime = new CourseTime();
    await courseTime.loadTime(id, normalizedStart, normalizedEnd, title);

    if (useCache) {
      courseMap.set(id, courseTime);
    }

    return courseTime;
  },

  /**
   * Load calendar data for a single student within a course.
   * Calls loadCourseTime to get CourseTime, then extracts student-specific data from the model.
   */
  async loadStudentTime(
    courseId: string,
    studentId: string,
    startDate?: string | null,
    endDate?: string | null
  ): Promise<TutorsTimeStudent> {
    if (!courseId) throw new Error("Course ID is required");
    if (!studentId) throw new Error("Student ID is required");

    const displayInfo = await this.getStudentDisplayInfo(studentId);
    const courseTime = await this.loadCourseTime(courseId, startDate ?? null, endDate ?? null);
    const course = courseTime;

    const calModel = course.calendarModel;
    const labsModel = course.labsModel;

    const studentCalRowWeek = calModel.week.rows.find((r) => r.studentid === studentId) ?? null;
    const studentCalRowDay = calModel.day.rows.find((r) => r.studentid === studentId) ?? null;
    const studentName = studentCalRowWeek?.full_name ?? studentDisplayName(displayInfo);

    const dates = calModel.dates ?? [];
    const weeks = calModel.weeks ?? [];

    const labColumns = labsModel.labs;
    const stepColumns = labsModel.steps;

    const studentLabRow =
      labsModel.lab.rows.find((r) => r.studentid === studentId) ??
      labsModel.lab.rows.find((r) => r.studentid === studentName) ??
      null;

    const studentStepRow =
      labsModel.step.rows.find((r) => r.studentid === studentId) ??
      labsModel.step.rows.find((r) => r.studentid === studentName) ??
      null;

    const labsByDay =
      dates.length > 0 && course.learningRecords.length > 0
        ? BaseLabModel.buildLabRowByDay(
            course.learningRecords,
            studentId,
            dates,
            studentName
          )
        : null;

    const labsMedianByDay =
      dates.length > 0 && course.learningRecords.length > 0
        ? BaseLabModel.buildMedianByDay(course.learningRecords, course.id, dates)
        : null;

    const hasCalData = (studentCalRowWeek != null || studentCalRowDay != null) && calModel.day.rows.length > 0;
    const hasLabData = studentLabRow != null && labsModel.lab.rows.length > 0;

    const courseWithMedians: TutorsTimeCourse = {
      ...course,
      labsMedianByDay,
      weeks,
      dates,
      labColumns,
      stepColumns
    };

    return {
      courseid: course.id,
      courseTitle: course.title,
      studentid: studentId,
      studentName,
      avatarUrl: displayInfo.avatar_url,
      online_status: displayInfo.online_status,
      sentiment: displayInfo.sentiment,
      course: courseWithMedians,
      calendarByWeek: studentCalRowWeek,
      calendarByDay: studentCalRowDay,
      labsByLab: studentLabRow,
      labsByDay,
      labsByStep: studentStepRow,
      error: course.error,
      hasData: hasCalData || hasLabData
    };
  }
};
