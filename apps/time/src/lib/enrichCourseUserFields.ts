import { getSupabase } from "@tutors/tutors-time-lib";
import type { TutorsTimeCourse } from "@tutors/tutors-time-lib";
import type { ConnectUserFieldsRow } from "$lib/connectUserFieldsRow";

type UserFields = { online_status: string; sentiment: string; avatar_url: string };

function applyUserFields(fieldsByGithub: Map<string, UserFields>, rows: ConnectUserFieldsRow[]): void {
  for (const r of rows) {
    const id = r.studentid?.trim();
    if (!id) {
      r.online_status = "";
      r.sentiment = "";
      r.avatar_url = "";
      continue;
    }
    const f = fieldsByGithub.get(id);
    r.online_status = f?.online_status ?? "";
    r.sentiment = f?.sentiment ?? "";
    r.avatar_url = f?.avatar_url ?? "";
  }
}

/**
 * Fetches `online_status`, `sentiment`, and `avatar_url` from tutors-connect-users for all students
 * in calendar and lab views, and attaches them to day/week and lab/step rows.
 */
export async function enrichCourseUserFields(course: TutorsTimeCourse | null): Promise<void> {
  if (!course) return;

  const ids = new Set<string>();
  if (course.calendarModel) {
    for (const r of course.calendarModel.day.rows) {
      const id = r.studentid?.trim();
      if (id) ids.add(id);
    }
  }
  if (course.labsModel) {
    for (const r of course.labsModel.lab.rows) {
      const id = r.studentid?.trim();
      if (id) ids.add(id);
    }
    for (const r of course.labsModel.step.rows) {
      const id = r.studentid?.trim();
      if (id) ids.add(id);
    }
  }
  if (ids.size === 0) return;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("tutors-connect-users")
    .select("github_id, online_status, sentiment, avatar_url")
    .in("github_id", [...ids]);

  if (error) {
    console.warn("enrichCourseUserFields:", error.message);
    return;
  }

  const fieldsByGithub = new Map<string, UserFields>();
  for (const row of data ?? []) {
    const gh = (row as { github_id?: string }).github_id?.trim();
    if (!gh) continue;
    const st = (row as { online_status?: string | null }).online_status;
    const sent = (row as { sentiment?: string | null }).sentiment;
    const av = (row as { avatar_url?: string | null }).avatar_url;
    fieldsByGithub.set(gh, {
      online_status: st != null && String(st).trim() !== "" ? String(st) : "",
      sentiment: sent != null && String(sent).trim() !== "" ? String(sent).trim() : "",
      avatar_url: av != null && String(av).trim() !== "" ? String(av).trim() : ""
    });
  }

  if (course.calendarModel) {
    applyUserFields(fieldsByGithub, course.calendarModel.day.rows);
    applyUserFields(fieldsByGithub, course.calendarModel.week.rows);
  }
  if (course.labsModel) {
    applyUserFields(fieldsByGithub, course.labsModel.lab.rows);
    applyUserFields(fieldsByGithub, course.labsModel.step.rows);
  }
}
