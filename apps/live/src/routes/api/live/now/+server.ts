import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { CACHE_TTL_MS, cacheHeaders, cached } from "$lib/server/cache";
import { liveContext } from "$lib/server/live";

/** Who is active right now, straight off the hot store. */
export const GET: RequestHandler = async () => {
  const { hot } = await liveContext();
  const snapshot = await cached("now", CACHE_TTL_MS.now, () => hot.now());
  return json(snapshot, { headers: cacheHeaders(CACHE_TTL_MS.now) });
};
