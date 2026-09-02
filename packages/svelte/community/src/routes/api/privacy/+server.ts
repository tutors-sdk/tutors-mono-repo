import { supabase } from "../../utils/supabase-client";
import { json } from "@sveltejs/kit";
import log from "@tutors/logger";

export async function GET() {
  if (!supabase) {
    return json({ error: "Supabase not initialized" }, { status: 500 });
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const [learningRecords, tutorsConnectUsers, tutorsConnectLatest, calendar] = await Promise.all([
      supabase.from("learning_records").select("*").eq("student_id", userId).throwOnError(),
      supabase.from("tutors-connect-users").select("*").eq("github_id", userId).throwOnError(),
      supabase.from("tutors-connect-latest").select("*").eq("student_id", userId).throwOnError(),
      supabase.from("calendar").select("*").eq("studentid", userId).throwOnError()
    ]);

    if (learningRecords.error) throw learningRecords.error;
    if (tutorsConnectUsers.error) throw tutorsConnectUsers.error;
    if (tutorsConnectLatest.error) throw tutorsConnectLatest.error;
    if (calendar.error) throw calendar.error;

    const data = {
      user_id: userId,
      exported_at: new Date().toISOString(),
      learning_records: learningRecords.data ?? [],
      tutors_connect_users: tutorsConnectUsers.data ?? [],
      tutors_connect_latest: tutorsConnectLatest.data ?? [],
      calendar: calendar.data ?? []
    };

    return json(data);
  } catch (error: any) {
    log.error("Privacy export failed:", error);
    return json({ error: error.message || "Failed to export data" }, { status: 500 });
  }
}

export async function DELETE() {
  if (!supabase) {
    return json({ error: "Supabase not initialized" }, { status: 500 });
  }

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !session?.user) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  try {
    const { error: deleteError } = await supabase
      .from("learning_records")
      .delete()
      .eq("student_id", userId)
      .throwOnError();

    if (deleteError) throw deleteError;

    const { error: tutorsConnectLatestError } = await supabase
      .from("tutors-connect-latest")
      .delete()
      .eq("student_id", userId)
      .throwOnError();

    if (tutorsConnectLatestError) throw tutorsConnectLatestError;

    const { error: calendarError } = await supabase
      .from("calendar")
      .delete()
      .eq("studentid", userId)
      .throwOnError();

    if (calendarError) throw calendarError;

    const { error: tutorsConnectUsersError } = await supabase
      .from("tutors-connect-users")
      .delete()
      .eq("github_id", userId)
      .throwOnError();

    if (tutorsConnectUsersError) throw tutorsConnectUsersError;

    return json({ success: true, message: "Data deleted successfully" });
  } catch (error: any) {
    log.error("Privacy deletion failed:", error);
    return json({ error: error.message || "Failed to delete data" }, { status: 500 });
  }
}
