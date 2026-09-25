import { json, error, type RequestHandler } from "@sveltejs/kit";
import { COURSE_SENTIMENT_IDS } from "@tutors/tutors-model-lib";
import { noContent, readJson, requireDb, requireUser } from "../../../lib/server/api/http.ts";
import { getUserStatus, updateUserStatus, upsertUser, type UserStatus } from "../../../lib/server/api/store.ts";
import * as check from "../../../lib/server/api/validate.ts";

/** The optional sentiment and online status in a body; anything else in it (a github id, a name) is ignored. */
function statusFrom(body: Record<string, unknown>): Partial<UserStatus> {
  const status: Partial<UserStatus> = {};
  if (body.sentiment !== undefined) {
    const sentiment = check.sentiment(body.sentiment, COURSE_SENTIMENT_IDS);
    if (!sentiment) error(400, "sentiment is not one of the course sentiments");
    status.sentiment = sentiment;
  }
  if (body.onlineStatus !== undefined) {
    const online = check.onlineStatus(body.onlineStatus);
    if (!online) error(400, 'onlineStatus is "online" or "offline"');
    status.online_status = online;
  }
  return status;
}

/** The signed-in user's stored sentiment and online status. */
export const GET: RequestHandler = async ({ locals }) => {
  const user = await requireUser(locals);
  return json(await getUserStatus(requireDb(), user.login));
};

/** On sign-in: create or refresh the user's row. Name, email and avatar come from the Auth.js session. */
export const PUT: RequestHandler = async ({ request, locals }) => {
  const user = await requireUser(locals);
  const status = statusFrom(await readJson(request));
  await upsertUser(requireDb(), user, status);
  return noContent();
};

/** Change the signed-in user's sentiment or online status (Rule 0072). */
export const PATCH: RequestHandler = async ({ request, locals }) => {
  const user = await requireUser(locals);
  const status = statusFrom(await readJson(request));
  if (!status.sentiment && !status.online_status) error(400, "sentiment or onlineStatus is required");
  await updateUserStatus(requireDb(), user.login, status);
  return noContent();
};
