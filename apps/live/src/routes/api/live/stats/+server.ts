import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { isRangeName, statsFor } from "@tutors/live-store";
import { CACHE_TTL_MS, cacheHeaders, cached } from "$lib/server/cache";
import { liveContext } from "$lib/server/live";

/**
 * Headline stats for a range, optionally narrowed to one course.
 *
 * The response also carries the daily series, the service mix and the top
 * courses: the dashboard needs all four to draw one row, and splitting them
 * across four endpoints would only mean four cache entries falling out of step.
 */
export const GET: RequestHandler = async ({ url }) => {
  const range = url.searchParams.get("range") ?? "7d";
  if (!isRangeName(range)) error(400, `unknown range: ${range}`);
  const course = url.searchParams.get("course");

  const { warehouse } = await liveContext();
  const stats = await cached(`stats:${range}:${course ?? ""}`, CACHE_TTL_MS.stats, () => statsFor(warehouse, range, course));
  return json(stats, { headers: cacheHeaders(CACHE_TTL_MS.stats) });
};
