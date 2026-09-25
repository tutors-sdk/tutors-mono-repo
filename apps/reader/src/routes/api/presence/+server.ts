import { error, type RequestHandler } from "@sveltejs/kit";
import { COURSE_SENTIMENT_IDS } from "@tutors/tutors-model-lib";
import { noContent, readJson, requireDb, requireUser, valid } from "../../../lib/server/api/http.ts";
import { upsertLatest } from "../../../lib/server/api/store.ts";
import * as check from "../../../lib/server/api/validate.ts";

/**
 * The learning object a student who shares their presence is on, kept as the latest per course for
 * the live dashboard. Who the student is comes from the session: the user in the payload is
 * replaced with the session's login, name and avatar (Rule 0064). Everyone can read the stored
 * record on the live dashboard, so only its known fields are kept, each checked.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  const user = await requireUser(locals);
  const body = await readJson(request, 16 * 1024);
  const courseId = valid(check.courseId(body.courseId), "courseId is required");
  const payload = body.payload as Record<string, unknown> | undefined;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) error(400, "payload is required");
  if (payload.courseId !== courseId) error(400, "payload.courseId must be the course");
  const sent = (payload.user ?? {}) as { sentiment?: unknown };
  const record: Record<string, unknown> = {
    courseId,
    courseUrl: check.text(payload.courseUrl, 300),
    courseTitle: check.text(payload.courseTitle, 300),
    title: check.text(payload.title, 300),
    loRoute: check.loRoute(payload.loRoute),
    type: check.loType(payload.type),
    img: check.imageUrl(payload.img),
    isPrivate: payload.isPrivate === true,
    user: {
      id: user.login,
      fullName: user.name ?? user.login,
      avatar: user.image ?? "",
      sentiment: check.sentiment(sent.sentiment, COURSE_SENTIMENT_IDS) ?? "neutral"
    }
  };
  const icon = check.icon(payload.icon);
  if (icon) record.icon = icon;
  // A field that was missing or failed its check is left out, as the browser would have left it.
  for (const key of Object.keys(record)) if (record[key] === null) delete record[key];
  await upsertLatest(requireDb(), user.login, courseId, record);
  return noContent();
};
