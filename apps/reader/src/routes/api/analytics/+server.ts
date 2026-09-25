import { error, type RequestHandler } from "@sveltejs/kit";
import { noContent, readJson, requireDb, requireUser, valid } from "../../../lib/server/api/http.ts";
import { recordPageLoad, recordTick } from "../../../lib/server/api/store.ts";
import * as check from "../../../lib/server/api/validate.ts";

/**
 * A signed-in student's learning analytics: a page load (`kind: "page-load"`) or the 30-second
 * "still reading" tick (`kind: "tick"`). The student is the session's login; a student id in the
 * body is ignored (Rules 0071, 0072).
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = await requireUser(locals);
  const body = await readJson(request);
  const courseId = valid(check.courseId(body.courseId), "courseId is required");
  const day = valid(check.calendarDay(body.day, new Date()), "day must be the browser's local date, yyyy-mm-dd");
  const db = requireDb();
  if (body.kind === "page-load") {
    const loId = valid(check.loRoute(body.loId), "loId is required");
    const loType = valid(check.loType(body.loType), "loType is required");
    await recordPageLoad(db, user.login, { courseId, loId, loType, day });
  } else if (body.kind === "tick") {
    const loId = body.loId === undefined || body.loId === null ? null : valid(check.loRoute(body.loId), "loId is malformed");
    await recordTick(db, user.login, { courseId, loId, day });
  } else {
    error(400, 'kind is "page-load" or "tick"');
  }
  return noContent();
};
