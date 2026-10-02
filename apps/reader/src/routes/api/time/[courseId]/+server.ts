import { json, type RequestHandler } from "@sveltejs/kit";
import log from "@tutors/logger";
import { sessionUser } from "../../../../lib/server/api/http.ts";
import { allowedOrigins, authorization } from "../../../../lib/server/api/access.ts";
import { AuthorizationUnavailableError } from "../../../../lib/server/api/authorization.ts";
import { serviceClient } from "../../../../lib/server/api/service-client.ts";
import { pseudonymise, readTimeRows } from "../../../../lib/server/api/time-data.ts";
import * as check from "../../../../lib/server/api/validate.ts";


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

  let educator: boolean;
  try {
    educator = await authorization().can(user, "analytics:view", { kind: "course", courseId });
  } catch (e) {
    // Not knowing who teaches the course is not the same as "not an educator" (Rule 0073).
    if (e instanceof AuthorizationUnavailableError) return answer(503, { message: "Could not read who teaches this course from its host; try again shortly" }, cors);
    throw e;
  }
  const rows = await readTimeRows(db, courseId);
  log.info("Time data read", { courseId, role: educator ? "educator" : "student" });
  return answer(200, educator ? rows : pseudonymise(rows, user.login), cors);
};

export const OPTIONS: RequestHandler = async ({ request, url }) => {
  const cors = corsHeaders(request, url);
  if (!cors) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "GET", "access-control-max-age": "600" } });
};
