import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { AssignmentsSyncService } from "$lib/server/services/AssignmentsSyncService";

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();

  const courseId = typeof body.courseId === "string" ? body.courseId.trim() : null;
  const moodleCourseId = Number(body.moodleCourseId);
  const moodleSectionId =
    body.moodleSectionId !== undefined && body.moodleSectionId !== null && body.moodleSectionId !== ""
      ? Number(body.moodleSectionId)
      : undefined;

  if (!courseId) {
    error(400, "courseId is required");
  }

  if (!Number.isInteger(moodleCourseId) || moodleCourseId <= 0) {
    error(400, "moodleCourseId must be a positive integer");
  }

  if (moodleSectionId !== undefined && (!Number.isInteger(moodleSectionId) || moodleSectionId <= 0)) {
    error(400, "moodleSectionId must be a positive integer");
  }

  const syncService = new AssignmentsSyncService();
  await syncService.sync(courseId, moodleCourseId, moodleSectionId);

  return json({ ok: true });
};
