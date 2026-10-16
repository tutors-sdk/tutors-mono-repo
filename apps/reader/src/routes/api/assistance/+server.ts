import type { RequestHandler } from "./$types";
import log from "@tutors/logger";
import type { HelpKind } from "@tutors/community/assistance";
import { HELP_REFUSALS, MAX_HELP_POST_BYTES, answer, assistance, parseHelpPost, sameOrigin } from "#lib/server/assistance.ts";

/**
 * /api/assistance: help requests on lab steps. A signed-in student asks, asks again, withdraws or
 * marks one solved; an educator of the course acknowledges, answers a hint or resolves. Every change
 * is written here as the session's actor and then told to the course's help queue topic (Rules 0390,
 * 0391). Only the reader's own pages may call it.
 */

const SIGN_IN = { message: "Sign in with GitHub to ask for help" };
const NOT_KEPT = { message: "Help requests are not kept on this server" };
const OTHER_ORIGIN = { message: "Only the reader's own pages may use help requests" };

/** GET /api/assistance?courseId=: the course's queue, from stored rows, for an educator of the course only (Rule 0392). */
export const GET: RequestHandler = async ({ request, url, locals, fetch }) => {
  if (!sameOrigin(request, url)) return answer(403, OTHER_ORIGIN);
  if (!locals.actor) return answer(401, SIGN_IN);
  const courseId = url.searchParams.get("courseId")?.trim() ?? "";
  if (!courseId) return answer(400, { message: "courseId is required" });
  const help = assistance(fetch);
  if (!help) return answer(503, NOT_KEPT);
  if (!(await help.educatorsOf(courseId)).includes(locals.actor.login)) {
    return answer(403, { message: "Only an educator of the course may read its help queue" });
  }
  try {
    return answer(200, { queue: await help.queue(courseId) });
  } catch (error) {
    log.error("Reading the help queue failed:", courseId, error);
    return answer(503, { message: "The help queue could not be read" });
  }
};

/** POST /api/assistance: `{ action, ... }` as `parseHelpPost` reads it. */
export const POST: RequestHandler = async ({ request, url, locals, fetch }) => {
  if (!sameOrigin(request, url)) return answer(403, OTHER_ORIGIN);
  if (!locals.actor) return answer(401, SIGN_IN);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_HELP_POST_BYTES) return answer(413, { message: "body is larger than 8 KB" });
  const raw = await request.text();
  if (raw.length > MAX_HELP_POST_BYTES) return answer(413, { message: "body is larger than 8 KB" });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return answer(400, { message: "body is not JSON" });
  }
  const post = parseHelpPost(body);
  if (typeof post === "string") return answer(400, { message: post });
  const help = assistance(fetch);
  if (!help) return answer(503, NOT_KEPT);
  const actor = locals.actor;
  const caller = { login: actor.login };
  const result =
    post.action === "request"
      ? await help.request(post.ref, post.kind as HelpKind, { login: actor.login, name: actor.name || null })
      : post.action === "acknowledge"
        ? await help.acknowledge(post.id, caller)
        : post.action === "answer-hint"
          ? await help.answerHint(post.id, caller, post.hintText)
          : post.action === "resolve"
            ? await help.resolve(post.id, caller)
            : await help.withdraw(post.id, caller);
  if (!result.ok) {
    const refusal = HELP_REFUSALS[result.reason];
    return answer(refusal.status, { message: refusal.message, reason: result.reason });
  }
  log.info("A help request changed", { action: post.action, courseId: result.request.ref.courseId, state: result.request.state });
  return answer(post.action === "request" ? 201 : 200, { request: result.request });
};
