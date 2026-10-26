import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { MAX_LIVE_ACTIVITY_BYTES, receiveLiveActivity } from "@tutors/community/services/live-activity.ts";

/**
 * Tutors Live's activity feed: the reader posts each learning event here, and this publishes it to the
 * Realtime topics a Live tab is watching, within the day's budget. See receiveLiveActivity.
 */
export const POST: RequestHandler = async ({ request }) => {
  // Refuse an oversized body before reading it, when the client says how big it is.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_LIVE_ACTIVITY_BYTES) {
    return json({ message: "body is larger than 4 KB" }, { status: 400 });
  }
  const result = await receiveLiveActivity(await request.text());
  return result.body === undefined ? new Response(null, { status: result.status }) : json(result.body, { status: result.status });
};
