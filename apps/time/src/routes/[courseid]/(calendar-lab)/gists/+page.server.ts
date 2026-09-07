/**
 * Lecturer snippet dashboard — authorised read (issue #155).
 *
 * `course_gists` is closed to the anon role, so this is the only way the
 * dashboard gets data. Every request is authorised as an educator of the
 * course before the service-role key is used.
 */

import type { PageServerLoad } from "./$types";
import { requireEducator, serviceClient } from "$lib/server/educator";
import log from "@tutors/logger";

export interface SnippetRow {
  id: string;
  created_at: string;
  expires_at: string;
  student_id: string;
  student_name: string | null;
  filename: string | null;
  content: string;
  title: string | null;
  lo_route: string | null;
  lo_title: string | null;
  avatar_url?: string | null;
}

export const load: PageServerLoad = async (event) => {
  const courseId = (event.params.courseid ?? "").trim();
  if (!courseId) {
    return { authorised: false as const, reason: "anonymous" as const, rows: [] };
  }

  const auth = await requireEducator(event, courseId);
  if (!auth.ok) {
    // No row data leaves the server unless the caller is an educator.
    return { authorised: false as const, reason: auth.reason, rows: [] };
  }

  let supabase;
  try {
    supabase = serviceClient();
  } catch (e) {
    log.error("Supabase not configured for snippet sharing:", e);
    return { authorised: true as const, error: "Snippet sharing is not configured", rows: [] };
  }

  const { data, error } = await supabase
    .from("course_gists")
    .select("id, created_at, expires_at, student_id, student_name, filename, content, title, lo_route, lo_title")
    .eq("course_id", courseId)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  if (error) {
    log.error("Failed to load course snippets:", error);
    return { authorised: true as const, error: "Failed to load snippets", rows: [] };
  }

  const rows = (data ?? []) as SnippetRow[];

  // Enrich student avatars (mirrors enrichCourseUserFields).
  const ids = [...new Set(rows.map((r) => r.student_id).filter(Boolean))];
  if (ids.length) {
    const { data: users } = await supabase
      .from("tutors-connect-users")
      .select("github_id, avatar_url")
      .in("github_id", ids);
    const byGithub = new Map<string, string | null>();
    for (const u of (users ?? []) as { github_id?: string; avatar_url?: string }[]) {
      if (u.github_id) byGithub.set(u.github_id, u.avatar_url ?? null);
    }
    for (const r of rows) {
      r.avatar_url = byGithub.get(r.student_id) ?? null;
    }
  }

  return { authorised: true as const, rows };
};
