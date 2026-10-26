/**
 * A student's own records for the privacy download (Rules 0068-0069): every table that keys a row by
 * their GitHub login. Read on the server with the service-role client, so the browser's anon key never
 * needs to read another person's rows; the caller passes only the signed-in actor's login. Null when
 * the server has no service key, which the route answers with 503.
 */
import { serviceSupabase } from "#lib/server/supabase-service.ts";

/** Each table holding a student's rows, and the column that names the student. */
const STUDENT_TABLES: Readonly<Record<string, string>> = {
  "tutors-connect-users": "github_id",
  "tutors-connect-profiles": "tutorId",
  "tutors-connect-latest": "student_id",
  learning_records: "student_id",
  calendar: "studentid"
};

export async function studentRecords(login: string): Promise<Record<string, unknown[]> | null> {
  const db = serviceSupabase();
  if (!db) return null;
  const tables = await Promise.all(
    Object.entries(STUDENT_TABLES).map(async ([table, column]) => {
      const { data, error } = await db.from(table).select("*").eq(column, login);
      if (error) throw error;
      return [table, data ?? []] as const;
    })
  );
  return Object.fromEntries(tables);
}
