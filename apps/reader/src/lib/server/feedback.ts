/**
 * The reader server's lecturer feedback: the Supabase store over the service-role client and the
 * course access rules read from each course's published tutors.json. Feedback is off (503 "not
 * kept") in anonymous mode or when PRIVATE_SUPABASE_SERVICE_ROLE_KEY is not set.
 */
import * as env from "$app/env/private";
import * as publicEnv from "$app/env/public";
import { courseAccessReader, feedbackApi, serviceClient, supabaseFeedbackStore, type FeedbackStore } from "@tutors/feedback/server";

let store: FeedbackStore | null | undefined;

function feedbackStore(): FeedbackStore | null {
  if (store !== undefined) return store;
  const client = publicEnv.PUBLIC_ANON_MODE === "TRUE" ? null : serviceClient(publicEnv.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_ROLE_KEY);
  store = client ? supabaseFeedbackStore(client) : null;
  return store;
}

/** One cache of course access rules for the server's lifetime, five minutes per course. */
const accessOf = courseAccessReader();

/** The feedback API for one request, reading courses with the request's fetch. */
export function feedback(fetchFn: typeof fetch) {
  return feedbackApi({ store: feedbackStore(), accessOf: (courseId) => accessOf(courseId, (url) => fetchFn(url)) });
}
