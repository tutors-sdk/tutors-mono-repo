import { json, error, type RequestHandler } from "@sveltejs/kit";
import { noContent, readJson, requireDb, requireUser, sessionUser, valid } from "../../../lib/server/api/http.ts";
import { getWhiteboardScene, saveWhiteboardScene, whiteboardRoomId } from "../../../lib/server/api/store.ts";
import * as check from "../../../lib/server/api/validate.ts";


export const GET: RequestHandler = async ({ url, locals }) => {
  const courseId = valid(check.courseId(url.searchParams.get("courseId")), "courseId is required");
  const route = valid(check.loRoute(url.searchParams.get("route")), "route is required");
  const shared = url.searchParams.get("shared") === "true";
  let owner: string | null = null;
  if (!shared) {
    const user = await sessionUser(locals);
    if (!user) error(401, "Sign in to open your personal whiteboard");
    owner = user.login;
  }
  return json({ scene: await getWhiteboardScene(requireDb(), whiteboardRoomId(courseId, route, owner)) });
};

export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = await requireUser(locals);
  const body = await readJson(request, 512 * 1024);
  const courseId = valid(check.courseId(body.courseId), "courseId is required");
  const route = valid(check.loRoute(body.route), "route is required");
  if (!Array.isArray(body.elements)) error(400, "elements is a list");
  const owner = body.shared === true ? null : user.login;
  await saveWhiteboardScene(requireDb(), whiteboardRoomId(courseId, route, owner), body.elements);
  return noContent();
};
