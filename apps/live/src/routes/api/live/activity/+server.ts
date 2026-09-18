import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { activityFor, isRangeName } from "@tutors/live-store";
import { CACHE_TTL_MS, cacheHeaders, cached } from "$lib/server/cache";
import { liveContext } from "$lib/server/live";

/**
 * Per-course activity: last seen, sessions, visitors and how many came back.
 *
 * Cached for the same window as the stats it sits beside rather than the
 * presence window: the part of it that moves minute to minute - who is active
 * now - arrives over SSE instead.
 */
export const GET: RequestHandler = async ({ url }) => {
  const range = url.searchParams.get("range") ?? "7d";
  if (!isRangeName(range)) error(400, `unknown range: ${range}`);
  const course = url.searchParams.get("course");

  const { warehouse, hot } = await liveContext();
  const activity = await cached(`activity:${range}:${course ?? ""}`, CACHE_TTL_MS.stats, () => activityFor(warehouse, hot, range, course));
  return json(activity, { headers: cacheHeaders(CACHE_TTL_MS.stats) });
};
