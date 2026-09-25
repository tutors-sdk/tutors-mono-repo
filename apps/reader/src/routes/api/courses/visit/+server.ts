import { error, type RequestHandler } from "@sveltejs/kit";
import { noContent, readJson, requireDb, valid } from "../../../../lib/server/api/http.ts";
import { authorization } from "../../../../lib/server/api/access.ts";
import { AuthorizationUnavailableError } from "../../../../lib/server/api/authorization.ts";
import { recordCourseVisit } from "../../../../lib/server/api/store.ts";
import * as check from "../../../../lib/server/api/validate.ts";

const NOT_A_CATALOGUE_COURSE = /^(main--|master--|deploy-preview--)|-{2}/;

export const POST: RequestHandler = async ({ request }) => {
  const body = await readJson(request);
  const courseId = valid(check.courseId(body.courseId), "courseId is required");
  if (NOT_A_CATALOGUE_COURSE.test(courseId)) return noContent();
  const facts = await authorization()
    .course(courseId)
    .catch((e: unknown) => {
      if (e instanceof AuthorizationUnavailableError) error(503, "Could not read this course from its host; try again shortly");
      throw e;
    });
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
