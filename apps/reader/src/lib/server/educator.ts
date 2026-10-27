/**
 * Server-side educator check for course data routes (Rules 0372, 0374, 0631). The browser's RBAC decides
 * what to show; this decides what the server will do. It loads the course's published tutors.json from
 * Netlify and accepts the signed-in actor only when their GitHub login is in its enrollment's educators.
 * Throws a SvelteKit error: 401 signed out, 400 for a course id outside the Netlify forms, 502 when the
 * published enrollment cannot be read, 403 for anyone else.
 */
import { error } from "@sveltejs/kit";
import { z } from "zod";
import log from "@tutors/logger";

const enrollmentSchema = z
  .object({
    educators: z.array(z.string()).default([]),
    whitelist: z.array(z.string()).default([]),
    students: z.array(z.object({ name: z.string(), id: z.string() }).passthrough()).default([])
  })
  .passthrough();

interface EducatorRequest {
  locals: App.Locals;
  courseId: string;
  fetch: typeof fetch;
  /** Words for the 401/403 messages, e.g. "export enrollment". */
  action: string;
}

export async function requireEducator({ locals, courseId, fetch, action }: EducatorRequest) {
  const actor = locals.actor;
  if (!actor) error(401, `Sign in to ${action}.`);
  // The reader retains the scheme in IDs derived from full Netlify URLs; activity uses that exact ID.
  const siteName = courseId.replace(/^https?:\/\//i, "");
  // shortcut: only Netlify course IDs are supported; custom hosts need vetted server-side fetching before support is added.
  if (!/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(siteName)) error(400, "This requires a Netlify course ID.");

  let published: unknown;
  try {
    const response = await fetch(`https://${siteName}.netlify.app/tutors.json`, {
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`Course returned ${response.status}`);
    published = await response.json();
  } catch (cause) {
    log.error("Educator check could not load course", { courseId, error: cause });
    error(502, "Could not load the published enrollment.");
  }
  const parsed = z.object({ enrollment: enrollmentSchema.optional() }).safeParse(published);
  if (!parsed.success) error(502, "The published enrollment is invalid.");
  const enrollment = parsed.data.enrollment;
  if (!enrollment?.educators.some((login) => login.toLowerCase() === actor.login.toLowerCase())) {
    error(403, `Only this course's educators can ${action}.`);
  }
  return { actor, enrollment };
}
