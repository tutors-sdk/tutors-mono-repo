import type { SupabaseClient } from "@supabase/supabase-js";
import type { SessionUser } from "./http.ts";

export class StoreError extends Error {}

function fail(what: string, error: { message?: string } | null): never {
  throw new StoreError(`${what}: ${error?.message ?? "unknown error"}`);
}


async function nextIncrement(db: SupabaseClient, field: "duration" | "count", courseId: string, login: string, loId: string): Promise<number> {
  const { data, error } = await db.rpc("get_count_learning_records", {
    field_name: field,
    course_base: courseId,
    user_name: login,
    lo_key: loId
  });
  if (error) fail("get_count_learning_records", error);
  return ((data as { increment?: number }[] | null)?.[0]?.increment ?? 0) + 1;
}

async function nextCalendarValue(db: SupabaseClient, column: "timeactive" | "pageloads", day: string, login: string, courseId: string): Promise<number> {
  const { data, error } = await db.from("calendar").select(column).eq("id", day).eq("studentid", login).eq("courseid", courseId).maybeSingle();
  if (error) fail("calendar read", error);
  const current = (data as Record<string, number | null> | null)?.[column];
  return current ? current + 1 : 1;
}

export async function recordPageLoad(
  db: SupabaseClient,
  login: string,
  input: { courseId: string; loId: string; loType: string; day: string }
): Promise<void> {
  const [duration, count] = await Promise.all([
    nextIncrement(db, "duration", input.courseId, login, input.loId),
    nextIncrement(db, "count", input.courseId, login, input.loId)
  ]);
  const { error } = await db.from("learning_records").upsert(
    {
      course_id: input.courseId,
      student_id: login,
      lo_id: input.loId,
      date_last_accessed: new Date().toISOString(),
      duration,
      count,
      type: input.loType
    },
    { onConflict: "student_id, course_id, lo_id", ignoreDuplicates: false }
  );
  if (error) fail("learning_records upsert", error);

  const [timeactive, pageloads] = await Promise.all([
    nextCalendarValue(db, "timeactive", input.day, login, input.courseId),
    nextCalendarValue(db, "pageloads", input.day, login, input.courseId)
  ]);
  const { error: calendarError } = await db
    .from("calendar")
    .upsert({ id: input.day, studentid: login, timeactive, pageloads, courseid: input.courseId }, { onConflict: "id, studentid, courseid" });
  if (calendarError) fail("calendar upsert", calendarError);
}

export async function recordTick(db: SupabaseClient, login: string, input: { courseId: string; loId: string | null; day: string }): Promise<void> {
  if (input.loId) {
    const duration = await nextIncrement(db, "duration", input.courseId, login, input.loId);
    const { error } = await db
      .from("learning_records")
      .update({ duration })
      .eq("student_id", login)
      .eq("course_id", input.courseId)
      .eq("lo_id", input.loId);
    if (error) fail("learning_records update", error);
  }
  const { error } = await db.rpc("increment_calendar", {
    field_name: "timeactive",
    row_id: input.day,
    student_id_value: login,
    course_id_value: input.courseId
  });
  if (error) fail("increment_calendar", error);
}


export interface UserStatus {
  sentiment: string | null;
  online_status: string | null;
}

export async function upsertUser(db: SupabaseClient, user: SessionUser, status: Partial<UserStatus>): Promise<void> {
  const row: Record<string, string | null> = {
    github_id: user.login,
    avatar_url: user.image,
    full_name: user.name?.trim() || user.login,
    email: user.email,
    date_last_accessed: new Date().toISOString()
  };
  if (status.sentiment) row.sentiment = status.sentiment;
  if (status.online_status) row.online_status = status.online_status;
  const { error } = await db.from("tutors-connect-users").upsert(row);
  if (error) fail("tutors-connect-users upsert", error);
}

export async function getUserStatus(db: SupabaseClient, login: string): Promise<UserStatus> {
  const { data, error } = await db.from("tutors-connect-users").select("sentiment, online_status").eq("github_id", login).maybeSingle();
  if (error) fail("tutors-connect-users read", error);
  const row = data as UserStatus | null;
  return { sentiment: row?.sentiment ?? null, online_status: row?.online_status ?? null };
}

export async function updateUserStatus(db: SupabaseClient, login: string, status: Partial<UserStatus>): Promise<void> {
  const change: Record<string, string> = { date_last_accessed: new Date().toISOString() };
  if (status.sentiment) change.sentiment = status.sentiment;
  if (status.online_status) change.online_status = status.online_status;
  const { error } = await db.from("tutors-connect-users").update(change).eq("github_id", login);
  if (error) fail("tutors-connect-users update", error);
}


export async function getProfile(db: SupabaseClient, login: string): Promise<unknown[]> {
  const { data, error } = await db.from("tutors-connect-profiles").select("profile").eq("tutorId", login).maybeSingle();
  if (error) fail("tutors-connect-profiles read", error);
  const profile = (data as { profile?: unknown } | null)?.profile;
  return Array.isArray(profile) ? profile : [];
}

export async function saveProfile(db: SupabaseClient, login: string, visits: unknown[]): Promise<void> {
  const { error } = await db.from("tutors-connect-profiles").upsert({ tutorId: login, profile: visits });
  if (error) fail("tutors-connect-profiles upsert", error);
}


export async function recordCourseVisit(db: SupabaseClient, courseId: string, courseRecord: Record<string, unknown>): Promise<void> {
  const { data, error } = await db.from("tutors-connect-courses").select("visit_count").eq("course_id", courseId).maybeSingle();
  if (error) fail("tutors-connect-courses read", error);
  const visits = ((data as { visit_count?: number } | null)?.visit_count ?? 0) + 1;
  const { error: upsertError } = await db
    .from("tutors-connect-courses")
    .upsert({ course_id: courseId, visited_at: new Date().toISOString(), visit_count: visits, course_record: courseRecord }, { onConflict: "course_id" });
  if (upsertError) fail("tutors-connect-courses upsert", upsertError);
}


export async function upsertLatest(db: SupabaseClient, login: string, courseId: string, payload: unknown): Promise<void> {
  const { error } = await db
    .from("tutors-connect-latest")
    .upsert({ course_id: courseId, student_id: login, payload, received_at: new Date().toISOString() }, { onConflict: "course_id,student_id" });
  if (error) fail("tutors-connect-latest upsert", error);
}


export async function setLock(db: SupabaseClient, login: string, courseId: string, loRoute: string, locked: boolean): Promise<void> {
  const { error } = await db
    .from("tutors_content_locks")
    .upsert({ course_id: courseId, lo_route: loRoute, locked, locked_by: login, locked_at: new Date().toISOString() }, { onConflict: "course_id,lo_route" });
  if (error) fail("tutors_content_locks upsert", error);
}

export async function removeLock(db: SupabaseClient, courseId: string, loRoute: string): Promise<void> {
  const { error } = await db.from("tutors_content_locks").delete().eq("course_id", courseId).eq("lo_route", loRoute);
  if (error) fail("tutors_content_locks delete", error);
}


export function whiteboardRoomId(courseId: string, route: string, owner: string | null): string {
  const base = `wb-${courseId}-${route.replace(/[^a-zA-Z0-9-]/g, "-")}`;
  // Personal rooms need a separate namespace: "route-owner" is a valid shared route.
  return owner ? `wb-personal:${encodeURIComponent(courseId)}:${encodeURIComponent(route)}:${encodeURIComponent(owner)}` : base;
}

export interface WhiteboardScene {
  elements: unknown;
  appState: unknown;
  files: unknown;
}

export async function getWhiteboardScene(db: SupabaseClient, roomId: string): Promise<WhiteboardScene | null> {
  const { data, error } = await db.from("whiteboard_scenes").select("elements, app_state, files").eq("room_id", roomId).maybeSingle();
  if (error) fail("whiteboard_scenes read", error);
  const row = data as { elements: unknown; app_state: unknown; files: unknown } | null;
  return row ? { elements: row.elements, appState: row.app_state, files: row.files } : null;
}

export async function saveWhiteboardScene(db: SupabaseClient, roomId: string, elements: unknown[]): Promise<void> {
  const { error } = await db.from("whiteboard_scenes").upsert({
    room_id: roomId,
    elements,
    app_state: { viewBackgroundColor: "#ffffff" },
    files: {},
    updated_at: new Date().toISOString()
  });
  if (error) fail("whiteboard_scenes upsert", error);
}
