import type { LayoutLoad } from "./$types";
import { TutorsTime } from "@tutors/tutors-time-lib";
import type { MessageKey } from "@tutors/i18n";

export const ssr = false;

const VIEWS = ["calendar", "lab", "medians", "assignments"];

/** Derive a human-readable view type from the current pathname. */
function getViewType(pathname: string): MessageKey | "" {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 1) return "";
  if (segments.length === 2 && !VIEWS.includes(segments[1])) return "classTime.student"; // /courseid/studentid
  if (segments[1] === "medians") return "classTime.medians";
  if (segments[1] === "assignments") return "classTime.assignments";
  // /courseid redirects to medians, so this is rarely seen
  if (segments.length === 1) return "classTime.medians";
  if (segments[1] === "calendar") {
    if (segments[2] === "byday") return "classTime.calendarByDay";
    if (segments[2] === "byweek") return "classTime.calendarByWeek";
    if (segments[2] === "raw") return "classTime.rawCalendar";
    if (segments.length >= 2) return "classTime.calendar";
  }
  if (segments[1] === "lab") {
    if (segments[2] === "bystep") return "classTime.labsByStep";
    if (segments[2] === "bylab") return "classTime.labsByLab";
    if (segments[2] === "learning-records") return "classTime.learningRecords";
    if (segments.length >= 2) return "classTime.labs";
  }
  return "";
}

export const load: LayoutLoad = async ({ url }) => {
  const pathname = url.pathname;
  const segments = pathname.split("/").filter(Boolean);
  const courseId = segments[0] ?? "";
  const viewType = getViewType(pathname);

  let courseTitle: string | null = null;
  let courseImg: string | null = null;
  let courseIcon: { type: string; color: string | null } | null = null;
  if (courseId.trim()) {
    try {
      const info = await TutorsTime.getCourseDisplayInfo(courseId);
      courseTitle = info.title;
      courseImg = info.img;
      courseIcon = info.icon;
    } catch {
      courseTitle = courseId;
    }
  }

  let studentName: string | null = null;
  let avatarUrl: string | null = null;
  let sentiment: string | null = "neutral";
  let onlineStatus: string | null = "online";
  const isStudentRoute =
    segments.length === 2 && !VIEWS.includes(segments[1]);
  if (isStudentRoute && courseId.trim()) {
    const studentId = segments[1] ?? "";
    try {
      const info = await TutorsTime.getStudentDisplayInfo(studentId);
      studentName = info.full_name;
      avatarUrl = info.avatar_url;
      sentiment = info.sentiment;
      onlineStatus = info.online_status;
    } catch {
      studentName = studentId;
    }
  }

  return {
    courseTitle,
    courseImg,
    courseIcon,
    viewType: viewType || null,
    courseId: courseId.trim() || null,
    studentName,
    avatarUrl,
    sentiment,
    onlineStatus
  };
};
