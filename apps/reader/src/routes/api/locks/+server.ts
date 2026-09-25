import { error, type RequestEvent, type RequestHandler } from "@sveltejs/kit";
import { noContent, readJson, requireDb, requireUser, valid } from "../../../lib/server/api/http.ts";
import { authorize } from "../../../lib/server/api/access.ts";
import { removeLock, setLock } from "../../../lib/server/api/store.ts";
import * as check from "../../../lib/server/api/validate.ts";

async function educatorRequest(request: Request, locals: RequestEvent["locals"]) {
  const user = await requireUser(locals);
  const body = await readJson(request);
  const courseId = valid(check.courseId(body.courseId), "courseId is required");
  const loRoute = valid(check.loRoute(body.loRoute), "loRoute is required");
  if (!(await authorize(user, "content:lock", { kind: "course", courseId }))) error(403, "Only an educator of this course can lock its content");
  return { user, body, courseId, loRoute };
}

export const PUT: RequestHandler = async ({ request, locals }) => {
  const { user, body, courseId, loRoute } = await educatorRequest(request, locals);
  if (typeof body.locked !== "boolean") error(400, "locked is true or false");
  await setLock(requireDb(), user.login, courseId, loRoute, body.locked);
  return noContent();
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
  const { courseId, loRoute } = await educatorRequest(request, locals);
  await removeLock(requireDb(), courseId, loRoute);
  return noContent();
};
