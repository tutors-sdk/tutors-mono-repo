import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import log from "@tutors/logger";
import { insights, insightsCors } from "#lib/server/insights.ts";

/**
 * GET /api/insights?courseId=&span=&day=[&learnerId=]: a course's lab steps ranked by the help
 * they needed, its help response times and its cohort over the day, week or month ending with
 * `day` (Rules 0412, 0413, 0415, 0571), or one student's requests, hints and annotations (Rule
 * 0414); for an educator of the course only. Tutors Time asks from its own origin with the
 * session. Answers `{ period, insights }` or `{ period, progress }`, or `{ message, reason }`;
 * `not-ready` when the database has no insights views yet (Rule 0416). Nothing is written.
 */
export const GET: RequestHandler = async ({ request, url, locals, fetch }) => {
  const cors = insightsCors(request, url);
  if (!cors) return json({ message: "This origin may not read insights", reason: "forbidden" }, { status: 403 });
  const answer = await insights(fetch).get(url.searchParams, locals.actor);
  if (answer.body.reason === "not-ready") log.warn("Insights were asked for but the insights views are missing", { courseId: url.searchParams.get("courseId") });
  return json(answer.body, { status: answer.status, headers: { ...cors, "cache-control": "no-store" } });
};

/** The preflight for Tutors Time's read with the session. */
export const OPTIONS: RequestHandler = async ({ request, url }) => {
  const cors = insightsCors(request, url);
  if (!cors) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: { ...cors, "access-control-allow-methods": "GET", "access-control-allow-headers": "accept", "access-control-max-age": "600" } });
};
