/**
 * GET /api/courses/:courseid/enrollment: a draft enrollment.yaml for a course, downloaded from the
 * educator control button. Requires a signed-in actor (401) who is listed as an educator in the course's
 * published tutors.json (403). Only Netlify course IDs are accepted (400). Reads the calendar and
 * tutors-connect-users tables through the public Supabase client; returns 503 without Supabase and 502
 * when the course or a query fails. Writes nothing.
 */
import { error } from "@sveltejs/kit";
import { supabase } from "@tutors/community/utils/supabase-client";
import log from "@tutors/logger";
import { requireEducator } from "#lib/server/educator.ts";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals, params, fetch }) => {
  const courseId = params.courseid;
  const { enrollment } = await requireEducator({ locals, courseId, fetch, action: "export enrollment" });
  if (!supabase) error(503, "Course activity is unavailable.");

  const educators = new Set(enrollment.educators.map((login) => login.toLowerCase()));
  const visitors = new Map<string, string>();
  // Read every page: a class accumulates many calendar rows per student over a term.
  for (let offset = 0; ;) {
    const { data, error: dbError } = await supabase
      .from("calendar")
      .select("studentid")
      .eq("courseid", courseId)
      .order("studentid")
      .order("id")
      .range(offset, offset + 499);
    if (dbError) {
      log.error("Enrollment export could not load activity", { courseId, error: dbError });
      error(502, "Could not load course activity.");
    }
    if (!data?.length) break;
    for (const row of data) {
      const login = row.studentid?.trim();
      if (login && !educators.has(login.toLowerCase())) visitors.set(login.toLowerCase(), login);
    }
    offset += data.length;
  }

  const logins = [...visitors.values()].sort((a, b) => a.localeCompare(b));
  const names = new Map<string, string>();
  for (let offset = 0; offset < logins.length; offset += 100) {
    const { data, error: dbError } = await supabase
      .from("tutors-connect-users")
      .select("github_id, full_name")
      .in("github_id", logins.slice(offset, offset + 100));
    if (dbError) {
      log.error("Enrollment export could not load names", { courseId, error: dbError });
      error(502, "Could not load student names.");
    }
    for (const row of data ?? []) {
      if (row.full_name?.trim()) names.set(row.github_id.toLowerCase(), row.full_name.trim());
    }
  }

  const whitelist = [...enrollment.whitelist];
  const allowed = new Set(whitelist.map((login) => login.toLowerCase()));
  const students = [...enrollment.students];
  const named = new Set(students.map((student) => student.id.toLowerCase()));
  for (const login of logins) {
    const key = login.toLowerCase();
    if (!allowed.has(key)) {
      whitelist.push(login);
      allowed.add(key);
    }
    if (!named.has(key)) {
      students.push({ name: names.get(key) ?? login, id: login });
      named.add(key);
    }
  }

  // JSON-quoted scalars and flow objects are valid YAML and keep names from introducing YAML syntax.
  const yaml =
    [
      "# Draft enrollment: includes recorded course visitors, who may not be enrolled students.",
      "# Review before publishing; names come from GitHub profiles. Existing entries are preserved.",
      ...Object.entries({ ...enrollment, whitelist, students }).map(([key, value]) =>
        Array.isArray(value) && value.length
          ? `${JSON.stringify(key)}:\n${value.map((entry) => `  - ${JSON.stringify(entry)}`).join("\n")}`
          : `${JSON.stringify(key)}: ${JSON.stringify(value)}`
      )
    ].join("\n") + "\n";

  return new Response(yaml, {
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="enrollment.yaml"',
      "Cache-Control": "private, no-store"
    }
  });
};
