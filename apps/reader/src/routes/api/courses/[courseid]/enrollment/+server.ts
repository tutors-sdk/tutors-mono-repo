/**
 * GET /api/courses/:courseid/enrollment: a draft enrollment.yaml for a course, downloaded from the
 * educator control button. requireEducator (educator.ts) checks the signed-in actor is an educator in the
 * course's published tutors.json (401, 400, 403, or 502 when it cannot be read). Reads the course's
 * visitors and their names through the Supabase adapter; returns 503 without Supabase and 502 when a
 * read fails. Writes nothing.
 */
import { error } from "@sveltejs/kit";
import { z } from "zod";
import { listsLogin, loginKey } from "@tutors/domain/access";
import { supabase } from "@tutors/store-supabase";
import { courseVisitorLogins, fullNamesOf } from "@tutors/store-supabase/server";
import log from "@tutors/logger";
import { requireEducator } from "#lib/server/educator.ts";
import type { RequestHandler } from "./$types";

const enrollmentSchema = z
  .object({
    educators: z.array(z.string()).default([]),
    whitelist: z.array(z.string()).default([]),
    students: z.array(z.object({ name: z.string(), id: z.string() }).passthrough()).default([])
  })
  .passthrough();

export const GET: RequestHandler = async ({ locals, params, fetch }) => {
  const courseId = params.courseid;
  const { enrollment: publishedEnrollment } = await requireEducator({ locals, courseId, fetch, action: "export enrollment" });
  const parsed = enrollmentSchema.safeParse(publishedEnrollment);
  if (!parsed.success) error(502, "The published enrollment is invalid.");
  const enrollment = parsed.data;
  if (!supabase) error(503, "Course activity is unavailable.");

  // Educators are not students: leave them out of the draft, however their logins are capitalised.
  let logins: string[];
  let stored: Map<string, string>;
  try {
    const visitors = new Map<string, string>();
    for (const login of await courseVisitorLogins(supabase, courseId)) {
      if (!listsLogin(enrollment.educators, login)) visitors.set(loginKey(login), login);
    }
    logins = [...visitors.values()].sort((a, b) => a.localeCompare(b));
    stored = await fullNamesOf(supabase, logins);
  } catch (dbError) {
    log.error("Enrollment export could not load activity", { courseId, error: dbError });
    error(502, "Could not load course activity.");
  }
  const names = new Map([...stored].map(([login, name]) => [loginKey(login), name]));

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
