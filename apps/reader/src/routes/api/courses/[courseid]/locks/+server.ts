/**
 * PUT /api/courses/:courseid/locks: lock or unlock one learning object, from Educator Control (Rules 0630-0632).
 * Body: { loRoute, locked }. Only a signed-in educator of the published course may change a lock
 * (requireEducator: 401, 400, 502, 403); locked_by is their GitHub login from the session, never from the body.
 * Writes tutors_content_locks with the server-only service key: 503 (before the educator check) when it is
 * not configured, 502 when the write fails. Reading locks stays in the browser with the anon key.
 */
import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import log from "@tutors/logger";
import { now } from "@tutors/runtime";
import { requireEducator } from "#lib/server/educator.ts";
import { serviceSupabase } from "#lib/server/supabase-service.ts";
import type { RequestHandler } from "./$types";

const lockSchema = z.object({ loRoute: z.string().min(1).max(512), locked: z.boolean() });

export const PUT: RequestHandler = async ({ locals, params, fetch, request }) => {
  const courseId = params.courseid;
  // No database means nothing to write or protect: the browser keeps its localStorage copy, as in a
  // reader without Supabase. Answer that before the educator check so it needs no network.
  const db = serviceSupabase();
  if (!db) error(503, "Content locks are unavailable.");
  const { actor } = await requireEducator({ locals, courseId, fetch, action: "change content locks" });
  const body = lockSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) error(400, "Expected { loRoute, locked }.");
  const { error: dbError } = await db.from("tutors_content_locks").upsert(
    {
      course_id: courseId,
      lo_route: body.data.loRoute,
      locked: body.data.locked,
      locked_by: actor.login,
      locked_at: now().toISOString()
    },
    { onConflict: "course_id,lo_route" }
  );
  if (dbError) {
    log.error("Content lock write failed", { courseId, loRoute: body.data.loRoute, error: dbError });
    error(502, "Could not save the content lock.");
  }
  return json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
};
