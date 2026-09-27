import { error, json, type RequestHandler } from "@sveltejs/kit";
import { authorization } from "../../../lib/server/api/access.ts";
import { AuthorizationUnavailableError } from "../../../lib/server/api/authorization.ts";
import { addBookmark, listBookmarks, MAX_BOOKMARKS, removeBookmark } from "../../../lib/server/api/bookmarks.ts";
import { publishedOwner } from "../../../lib/server/api/home.ts";
import { noContent, readJson, requireDb, requireUser, valid } from "../../../lib/server/api/http.ts";
import * as check from "../../../lib/server/api/validate.ts";

async function change(request: Request) {
  const body = await readJson(request);
  return {
    courseId: valid(check.courseId(body.courseId), "courseId is required"),
    loRoute: valid(check.loRoute(body.loRoute), "loRoute is required")
  };
}

/** The signed-in reader's bookmarks, newest first (Rule 0150). */
export const GET: RequestHandler = async ({ locals }) => {
  const user = await requireUser(locals);
  return json({ bookmarks: await listBookmarks(requireDb(), user.login) });
};

/** Bookmarks a learning object the course publishes, with the course's own title and type (Rules 0152, 0153). */
export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = await requireUser(locals);
  const { courseId, loRoute } = await change(request);
  const db = requireDb();
  let facts;
  try {
    facts = await authorization().course(courseId);
  } catch (e) {
    if (e instanceof AuthorizationUnavailableError) error(503, "Could not read this course from its host; try again shortly");
    throw e;
  }
  const lo = facts ? publishedOwner(facts.learningObjects, loRoute) : undefined;
  if (!lo) error(404, "This course publishes no such learning object");
  const existing = await listBookmarks(db, user.login);
  const already = existing.some((b) => b.courseId === courseId && b.loRoute === loRoute);
  if (!already && existing.length >= MAX_BOOKMARKS) error(409, `You can keep at most ${MAX_BOOKMARKS} bookmarks; remove one first`);
  await addBookmark(db, user.login, { courseId, loRoute, title: lo.title, loType: lo.type });
  return noContent();
};

/** Forgets one of the signed-in reader's bookmarks (Rule 0151). */
export const DELETE: RequestHandler = async ({ request, locals }) => {
  const user = await requireUser(locals);
  const { courseId, loRoute } = await change(request);
  await removeBookmark(requireDb(), user.login, courseId, loRoute);
  return noContent();
};
