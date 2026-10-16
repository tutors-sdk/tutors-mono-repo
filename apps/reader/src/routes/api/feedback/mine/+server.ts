import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { feedback } from "#lib/server/feedback.ts";

/**
 * GET /api/feedback/mine?courseId=: what the signed-in reader received in the course, explanations
 * for everyone included and revoked ones left out, newest first (Rule 0409), in a course that admits
 * them (Rule 0567). Nobody reads another student's.
 */
export const GET: RequestHandler = async ({ url, locals, fetch }) => {
  const answer = await feedback(fetch).mine(url.searchParams.get("courseId"), locals.actor);
  return json(answer.body, { status: answer.status });
};
