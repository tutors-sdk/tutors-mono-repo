import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import log from "@tutors/logger";
import { feedback } from "#lib/server/feedback.ts";

/** The longest request body read, in bytes: an annotation of 4000 characters and its step. */
const MAX_BODY_BYTES = 32 * 1024;

/**
 * /api/feedback: lecturer feedback on lab steps. A signed-in reader of the course reads what was
 * posted for them at a step (Rule 0403); an educator of the course also reads the step's history,
 * posts to one student or to everyone on the step and revokes (Rules 0400-0402, 0406, 0409). Every
 * write runs here as the session's actor (Rule 0565).
 */
export const GET: RequestHandler = async ({ url, locals, fetch }) => {
  const answer = await feedback(fetch).step(Object.fromEntries(url.searchParams), locals.actor);
  return json(answer.body, { status: answer.status });
};

/** POST /api/feedback: `{ action: "annotate", courseId, labRoute, stepId, body, learnerId | everyone }` or `{ action: "revoke", id }`. */
export const POST: RequestHandler = async ({ request, locals, fetch }) => {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) return json({ message: "body is larger than 32 KB", reason: "invalid" }, { status: 400 });
  const raw = await request.text();
  let body: unknown = null;
  try {
    body = raw.length > MAX_BODY_BYTES ? null : JSON.parse(raw);
  } catch {
    body = null;
  }
  const answer = await feedback(fetch).post(body, locals.actor);
  if (answer.status < 300) log.info("Feedback changed", { status: answer.status });
  return json(answer.body, { status: answer.status });
};
