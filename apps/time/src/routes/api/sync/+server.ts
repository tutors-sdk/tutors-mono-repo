import { json, error } from "@sveltejs/kit";
import { env } from "$env/dynamic/private";
import { timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "./$types";
import { AssignmentsSyncService } from "$lib/server/services/AssignmentsSyncService";

export const POST: RequestHandler = async ({ request }) => {
  const token = env.PRIVATE_MOODLE_SYNC_TOKEN;
  if (!token) error(503, "Moodle sync is not configured");
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) error(401, "Moodle sync token is required");

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) error(400, "Expected a JSON object");
    body = parsed as Record<string, unknown>;
  } catch {
    error(400, "Expected a JSON object");
  }

  const courseId = typeof body.courseId === "string" ? body.courseId.trim() : null;
  const moodleCourseId = Number(body.moodleCourseId);
  const moodleSectionId =
    body.moodleSectionId !== undefined && body.moodleSectionId !== null && body.moodleSectionId !== ""
      ? Number(body.moodleSectionId)
      : undefined;

  if (!courseId || !/^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/.test(courseId) || courseId.includes("..")) {
    error(400, "courseId is malformed");
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
