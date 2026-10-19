/**
 * POST /api/courses/:courseid/moodle-sync: copy the course's Moodle assignments and submissions into the
 * tables Tutors Time reads, from Educator Control (Rules 0633-0634). Body: { moodleCourseId, moodleSectionId? }.
 * Only a signed-in educator of the published course may sync (requireEducator: 401, 400, 502, 403), and
 * that check runs before Moodle is contacted. 503 when Moodle or the service key is not configured,
 * 502 when Moodle or the write fails. Rows are keyed by the course's bare Netlify site name, the key Tutors Time
 * reads, whichever form (id or full URL) the reader opened the course with.
 */
import { error, json } from "@sveltejs/kit";
import { z } from "zod";
import log from "@tutors/logger";
import { requireEducator } from "#lib/server/educator.ts";
import { serviceSupabase } from "#lib/server/supabase-service.ts";
import { moodleConfigured } from "#lib/server/moodle/moodle-client.ts";
import { AssignmentsSyncService } from "#lib/server/moodle/assignments-sync-service.ts";
import type { RequestHandler } from "./$types";

const moodleId = z.coerce.number().int().positive();
const syncSchema = z.object({
  moodleCourseId: moodleId,
  moodleSectionId: z.preprocess((value) => (value === "" || value === null ? undefined : value), moodleId.optional())
});

export const POST: RequestHandler = async ({ locals, params, fetch, request }) => {
  const courseId = params.courseid;
  const { actor } = await requireEducator({ locals, courseId, fetch, action: "sync Moodle assignments" });
  const body = syncSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) error(400, "Expected { moodleCourseId, moodleSectionId? } as positive integers.");
  if (!moodleConfigured() || !serviceSupabase()) error(503, "Moodle sync is unavailable.");

  const { moodleCourseId, moodleSectionId } = body.data;
  const siteName = courseId.replace(/^https?:\/\//i, "").replace(/\.netlify\.app$/i, "");
  try {
    await new AssignmentsSyncService().sync(siteName, moodleCourseId, moodleSectionId);
  } catch (cause) {
    log.error("Moodle sync failed", { courseId, moodleCourseId, moodleSectionId, actor: actor.login, error: cause });
    error(502, "Moodle sync failed.");
  }
  log.info("Moodle sync finished", { courseId, moodleCourseId, moodleSectionId, actor: actor.login });
  return json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
};
