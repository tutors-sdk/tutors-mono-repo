import { error, type RequestHandler } from "@sveltejs/kit";
import { noContent, readJson, requireDb, valid } from "../../../../lib/server/api/http.ts";
import { courseAccess } from "../../../../lib/server/api/access.ts";
import { recordCourseVisit } from "../../../../lib/server/api/store.ts";
import * as check from "../../../../lib/server/api/validate.ts";

/** Branch deploys and preview builds are not catalogue entries. */
const NOT_A_CATALOGUE_COURSE = /^(main--|master--|deploy-preview--)|-{2}/;

/**
 * A visit to a course, counted in the public catalogue. Anyone may visit a course, so no session is
 * needed; but the course must exist on its host, and its title, credits and privacy come from the
 * published course rather than from the request.
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = await readJson(request);
  const courseId = valid(check.courseId(body.courseId), "courseId is required");
  if (NOT_A_CATALOGUE_COURSE.test(courseId)) return noContent();
  const facts = await courseAccess().course(courseId);
  if (!facts) error(404, "No published course with that id");
  const sent = (body.courseRecord ?? {}) as Record<string, unknown>;
  const record: Record<string, unknown> = {
    id: courseId,
    title: facts.title ?? courseId,
    lastVisit: new Date().toISOString(),
    credits: facts.credits ?? "",
    private: facts.isPrivate
  };
  const icon = check.icon(sent.icon);
  const img = check.imageUrl(sent.img);
  if (icon) record.icon = icon;
  else if (img) record.img = img;
  await recordCourseVisit(requireDb(), courseId, record);
  return noContent();
};
