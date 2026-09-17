import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { coursesFor } from "@tutors/live-store";
import { CACHE_TTL_MS, cacheHeaders, cached } from "$lib/server/cache";
import { liveContext } from "$lib/server/live";

/** The courses the filter offers. Cached as long as the heat maps: the list barely moves. */
export const GET: RequestHandler = async () => {
  const { warehouse } = await liveContext();
  const courses = await cached("courses", CACHE_TTL_MS.heatmap, () => coursesFor(warehouse));
  return json({ courses }, { headers: cacheHeaders(CACHE_TTL_MS.heatmap) });
};
