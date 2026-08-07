import type { LayoutLoad } from "./$types";
import { TutorsTime } from "@tutors/tutors-time-lib";

export const ssr = false;

/** Derive a human-readable view type from the current pathname. */
function getViewType(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length < 1) return "";
  if (segments.length === 2 && segments[1] !== "calendar" && segments[1] !== "lab" && segments[1] !== "medians") return "Student Calendar"; // /courseid/studentid
  if (segments[1] === "medians") return "Medians";
  // /courseid redirects to medians, so this is rarely seen
  if (segments.length === 1) return "Medians";
  if (segments[1] === "calendar") {
    if (segments[2] === "byday") return "Calendar by day";
    if (segments[2] === "byweek") return "Calendar by week";
    if (segments[2] === "raw") return "Raw Calendar";
    if (segments.length >= 2) return "Calendar";
  }
  if (segments[1] === "lab") {
    if (segments[2] === "bystep") return "Lab by step";
    if (segments[2] === "bylab") return "Lab by lab";
    if (segments[2] === "learning-records") return "Learning Records";
    if (segments.length >= 2) return "Lab";
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
    segments.length === 2 &&
    segments[1] !== "calendar" &&
    segments[1] !== "lab" &&
    segments[1] !== "medians";
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
