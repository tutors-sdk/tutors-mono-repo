import { supabase } from "../../../utils/supabase-client";
import { json } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import log from "@tutors/logger";

export async function GET({ url }: RequestEvent) {
  if (!supabase) {
    return json({ error: "Supabase not configured" }, { status: 503 });
  }

  const userId = url.searchParams.get("userId");
  if (!userId || !userId.trim()) {
    return json({ error: "userId query parameter is required" }, { status: 400 });
  }

  const id = userId.trim();

  try {
    const [learningRecords, tutorsConnectUsers, tutorsConnectLatest, calendar] = await Promise.all([
      supabase.from("learning_records").select("*").eq("student_id", id),
      supabase.from("tutors-connect-users").select("*").eq("github_id", id),
      supabase.from("tutors-connect-latest").select("*").eq("student_id", id),
      supabase.from("calendar").select("*").eq("studentid", id)
    ]);

    const data = {
      user_id: id,
      exported_at: new Date().toISOString(),
      learning_records: learningRecords.data ?? [],
      tutors_connect_users: tutorsConnectUsers.data ?? [],
      tutors_connect_latest: tutorsConnectLatest.data ?? [],
      calendar: calendar.data ?? []
    };

    return json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to export data";
    log.error("Privacy data export failed:", error);
    return json({ error: message }, { status: 500 });
  }
}

export async function DELETE({ request }: RequestEvent) {
  if (!supabase) {
    return json({ error: "Supabase not configured" }, { status: 503 });
  }

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON with a userId field" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return json({ error: "userId is required in the request body" }, { status: 400 });
  }

  const deletions = [
    { table: "learning_records", column: "student_id" },
    { table: "tutors-connect-latest", column: "student_id" },
    { table: "calendar", column: "studentid" },
    { table: "tutors-connect-users", column: "github_id" }
  ];

  const errors: { table: string; message: string }[] = [];

  for (const { table, column } of deletions) {
    const { error } = await supabase.from(table).delete().eq(column, userId);
    if (error) {
      log.error(`Privacy deletion from ${table} failed:`, error);
      errors.push({ table, message: error.message });
    }
  }

  if (errors.length > 0) {
    return json({
      error: "Partial deletion — some tables failed",
      details: errors,
      message: "Please retry or contact the Data Controller to complete erasure"
    }, { status: 207 });
  }

  return json({ success: true, message: "All personal data has been deleted" });
}
