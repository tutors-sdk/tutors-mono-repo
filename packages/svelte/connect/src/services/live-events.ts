import { env } from "$env/dynamic/public";
import log from "@tutors/logger";
import { createLiveEmitter, opaqueUid, serviceForLoType, startEmitterLifecycle, type LiveEmitter } from "@tutors/live-events";

/**
 * The reader's connection to Tutors Live.
 *
 * It is deliberately separate from the analytics and presence services: those
 * need a Supabase session and stop dead in anonymous mode, while live events
 * carry no identity and are the same whether or not anyone is signed in. That
 * is the whole point of the model - the dashboard counts everybody, and knows
 * who nobody is.
 *
 * With `PUBLIC_LIVE_EVENTS_URL` unset the emitter is disabled and every call
 * below is a no-op, so this costs an unconfigured deployment nothing.
 */

/** The opaque identifier for a signed-in learner who opted in, once it has been hashed. */
let optedInUid: string | undefined;

/**
 * Events come from a reader in front of a person, never from a render on the
 * server. `typeof document` rather than SvelteKit's `browser` so this module
 * stays free of `$app/*`, which a unit test would have to mock.
 */
const inBrowser = typeof document !== "undefined";

export const liveEmitter: LiveEmitter = createLiveEmitter({
  endpoint: inBrowser ? env.PUBLIC_LIVE_EVENTS_URL : undefined,
  uid: () => optedInUid,
  onError: (error) => log.debug("live events could not be posted", { error: String(error) })
});

/**
 * Records that a signed-in learner has opted in to being counted as returning.
 * Hashing is asynchronous, so the identifier joins the next session rather than
 * the one already open - which is the conservative order to get it in.
 */
export async function optInToLiveEvents(login: string): Promise<void> {
  if (!liveEmitter.enabled || !login) return;
  optedInUid = await opaqueUid(login);
}

/** Drops the identifier. The learner's earlier events are purged server-side. */
export function optOutOfLiveEvents(): void {
  optedInUid = undefined;
}

/** A course was opened. Starts the session if this is the first one. */
export function reportCourseOpened(courseId: string): void {
  liveEmitter.courseOpened(courseId);
}

/**
 * A learning object was opened: one `lo.viewed`, plus a `service.used` when the
 * type maps onto a catalogued service.
 */
export function reportLoViewed(courseId: string, route: string, loType: string): void {
  if (!liveEmitter.enabled || !courseId || !route) return;
  liveEmitter.loViewed(courseId, route, loType);
  const service = serviceForLoType(loType);
  if (service) liveEmitter.serviceUsed(courseId, service);
}

/** A named service was used directly, for the ones no learning object type implies. */
export function reportServiceUsed(courseId: string, service: Parameters<LiveEmitter["serviceUsed"]>[1]): void {
  liveEmitter.serviceUsed(courseId, service);
}

/**
 * Starts the heartbeat and the page-hide flush.
 * @returns a function that stops both, for the caller's teardown.
 */
export function startLiveEvents(course: () => string | undefined, lo: () => string | undefined): () => void {
  return startEmitterLifecycle(liveEmitter, course, { lo });
}
