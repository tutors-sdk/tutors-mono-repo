import type { RequestHandler } from "./$types";
import log from "@tutors/logger";
import type { HelpKind } from "@tutors/community/assistance";
import { HELP_REFUSALS, MAX_HELP_POST_BYTES, allowedOrigin, answer, assistance, mayAskIn, parseHelpPost } from "#lib/server/assistance.ts";

/**
 * /api/assistance: help requests on lab steps. A signed-in student asks, asks again, withdraws, marks
 * one solved or says whether it helped (Rule 0398); an educator of the course acknowledges, answers a
 * hint or resolves. Every change is written here as the session's actor and then told to the course's
 * help queue topic (Rules 0390, 0391). Only the reader's own pages and Tutors Live's course page, which
 * sends the lecturer's reader session, may call it.
 */

const SIGN_IN = { message: "Sign in with GitHub to ask for help" };
const NOT_KEPT = { message: "Help requests are not kept on this server" };
const OTHER_ORIGIN = { message: "Only the reader's own pages and Tutors Live may use help requests" };

/** GET /api/assistance?courseId=: the course's queue, from stored rows, for an educator of the course only (Rule 0392). */
export const GET: RequestHandler = async ({ request, url, locals, fetch }) => {
  const cors = allowedOrigin(request, url, true);
  if (!cors) return answer(403, OTHER_ORIGIN);
  if (!locals.actor) return answer(401, SIGN_IN, cors);
  const courseId = url.searchParams.get("courseId")?.trim() ?? "";
  if (!courseId) return answer(400, { message: "courseId is required" }, cors);
  const help = assistance(fetch);
  if (!help) return answer(503, NOT_KEPT, cors);
  if (!(await help.educatorsOf(courseId)).includes(locals.actor.login)) {
    return answer(403, { message: "Only an educator of the course may read its help queue" }, cors);
  }
  try {
    return answer(200, { queue: await help.queue(courseId) }, cors);
  } catch (error) {
    log.error("Reading the help queue failed:", courseId, error);
    return answer(503, { message: "The help queue could not be read" }, cors);
  }
};

/** POST /api/assistance: `{ action, ... }` as `parseHelpPost` reads it. */
export const POST: RequestHandler = async ({ request, url, locals, fetch }) => {
  const cors = allowedOrigin(request, url, true);
  if (!cors) return answer(403, OTHER_ORIGIN);
  if (!locals.actor) return answer(401, SIGN_IN, cors);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_HELP_POST_BYTES) return answer(413, { message: "body is larger than 8 KB" }, cors);
  const raw = await request.text();
  if (raw.length > MAX_HELP_POST_BYTES) return answer(413, { message: "body is larger than 8 KB" }, cors);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return answer(400, { message: "body is not JSON" }, cors);
  }
  const post = parseHelpPost(body);
  if (typeof post === "string") return answer(400, { message: post }, cors);
  const help = assistance(fetch);
  if (!help) return answer(503, NOT_KEPT, cors);
  const actor = locals.actor;
  const caller = { login: actor.login };
  if (post.action === "request" && !(await mayAskIn(post.ref.courseId, actor.login, fetch))) {
    return answer(403, { message: "You can ask for help only in a published course you may open" }, cors);
  }
  const result =
    post.action === "request"
      ? await help.request(post.ref, post.kind as HelpKind, { login: actor.login, name: actor.name || null })
      : post.action === "acknowledge"
        ? await help.acknowledge(post.id, caller)
        : post.action === "answer-hint"
          ? await help.answerHint(post.id, caller, post.hintText)
          : post.action === "resolve"
            ? await help.resolve(post.id, caller)
            : post.action === "rate"
              ? await help.rate(post.id, caller, post.helped)
              : await help.withdraw(post.id, caller);
  if (!result.ok) {
    const refusal = HELP_REFUSALS[result.reason];
    return answer(refusal.status, { message: refusal.message, reason: result.reason }, cors);
  }
  log.info("A help request changed", { action: post.action, courseId: result.request.ref.courseId, state: result.request.state });
  return answer(post.action === "request" ? 201 : 200, { request: result.request }, cors);
};

/** The preflight Tutors Live's JSON post needs. */
export const OPTIONS: RequestHandler = async ({ request, url }) => {
  const cors = allowedOrigin(request, url, true);
  if (!cors) return new Response(null, { status: 403 });
  return new Response(null, {
    status: 204,
    headers: { ...cors, "access-control-allow-methods": "GET, POST", "access-control-allow-headers": "content-type", "access-control-max-age": "600" }
  });
};
