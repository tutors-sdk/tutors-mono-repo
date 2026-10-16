/**
 * The reader server's learning insights: the read over the insights views with the service-role
 * client, and the course access rules read from each course's published tutors.json. Insights are
 * off (503 "not kept") in anonymous mode or when PRIVATE_SUPABASE_SERVICE_ROLE_KEY is not set.
 * Tutors Time asks from its own origin (PUBLIC_TIME_ORIGIN) with the reader's session.
 */
import * as env from "$app/env/private";
import * as publicEnv from "$app/env/public";
import { courseAccessReader, serviceClient } from "@tutors/feedback/server";
import { insightsApi, supabaseInsightsRead, type InsightsRead } from "@tutors/insights/server";

let read: InsightsRead | null | undefined;

function insightsRead(): InsightsRead | null {
  if (read !== undefined) return read;
  const client = publicEnv.PUBLIC_ANON_MODE?.trim().toUpperCase() === "TRUE" ? null : serviceClient(publicEnv.PUBLIC_SUPABASE_URL, env.PRIVATE_SUPABASE_SERVICE_ROLE_KEY);
  read = client ? supabaseInsightsRead(client) : null;
  return read;
}

/** One cache of course access rules for the server's lifetime, five minutes per course. */
const accessOf = courseAccessReader();

/** The insights API for one request, reading courses with the request's fetch. */
export function insights(fetchFn: typeof fetch) {
  return insightsApi({ read: insightsRead(), accessOf: (courseId) => accessOf(courseId, (url) => fetchFn(url)) });
}

/** Tutors Time's origin, the one other origin that may read insights with the session. */
function timeOrigin(): string {
  const origin = publicEnv.PUBLIC_TIME_ORIGIN?.trim() || "https://time.tutors.dev";
  return origin.endsWith("/") ? origin.slice(0, -1) : origin;
}

/**
 * The CORS headers for a request from the reader's own pages (none needed) or from Tutors Time;
 * null for any other origin, which is refused.
 */
export function insightsCors(request: Request, url: URL): Record<string, string> | null {
  const origin = request.headers.get("origin");
  if (!origin || origin === url.origin) return {};
  if (origin !== timeOrigin()) return null;
  return { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "Origin" };
}
