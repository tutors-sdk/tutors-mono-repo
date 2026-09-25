import { json, type RequestHandler } from "@sveltejs/kit";
import log from "@tutors/logger";
import { sessionUser } from "../../../../lib/server/api/http.ts";
import { allowedOrigins, courseAccess } from "../../../../lib/server/api/access.ts";
import { serviceClient } from "../../../../lib/server/api/service-client.ts";
import { pseudonymise, readTimeRows } from "../../../../lib/server/api/time-data.ts";
import * as check from "../../../../lib/server/api/validate.ts";

/**
 * A course's time data for Tutors Time: every row for an educator of the course, the viewer's own
 * rows and pseudonymised classmates for anyone else signed in (Rule 0066), 401 for nobody (Rule 0071).
 *
 * The time dashboard runs on its own origin and has no sign-in of its own, so it calls this route
 * with `credentials: "include"` and the reader's session cookie comes along (the two share a site).
 * Only origins in PRIVATE_API_ALLOWED_ORIGINS get the CORS headers that let their page read the
 * answer, and a request from any other origin is refused before the database is touched.
 */

function corsHeaders(request: Request, url: URL): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (!origin || origin === url.origin) return {};
  if (!allowedOrigins().includes(origin)) return null;
  return { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" };
}

function answer(status: number, body: unknown, headers: Record<string, string>): Response {
  return json(body, { status, headers: { ...headers, "cache-control": "private, no-store" } });
}

export const GET: RequestHandler = async ({ request, url, params, locals }) => {
  const cors = corsHeaders(request, url);
  if (!cors) return answer(403, { message: "This origin may not read time data" }, {});
  const courseId = check.courseId(params.courseId);
  if (!courseId) return answer(400, { message: "courseId is malformed" }, cors);
  const user = await sessionUser(locals);
  if (!user) return answer(401, { message: "Sign in to the reader to see time data" }, cors);
  const db = serviceClient();
  if (!db) return answer(503, { message: "Time data is not configured on this server" }, cors);

  const rows = await readTimeRows(db, courseId);
  const educator = await courseAccess().isEducator(user.login, courseId);
  log.info("Time data read", { courseId, role: educator ? "educator" : "student" });
  return answer(200, educator ? rows : pseudonymise(rows, user.login), cors);
};

/** The CORS preflight for an allowed origin. */
export const OPTIONS: RequestHandler = async ({ request, url }) => {
  const cors = corsHeaders(request, url);
  if (!cors) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "GET", "access-control-max-age": "600" } });
};
