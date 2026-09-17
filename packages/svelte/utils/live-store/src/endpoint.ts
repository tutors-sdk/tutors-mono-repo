import { MAX_BATCH_SIZE, parseLiveEvents, type Rejection } from "@tutors/live-events";
import type { Bus } from "./types.ts";

/**
 * The ingest endpoint, as a plain `Request` to `Response` function.
 *
 * A browser cannot speak to the bus, so the reader posts batches here and this
 * publishes them. It is anonymous and unauthenticated on purpose: the whole
 * model is that being counted costs no identity. That makes validation the only
 * defence, so nothing is trusted, the body is bounded, and a bad event is
 * dropped with a reason rather than repaired.
 *
 * It lives in the package rather than in the route so that it can be tested as
 * what it is - a function over a request - without standing up SvelteKit.
 */

/** Refuse anything larger than a full batch of long-fielded events. */
export const MAX_EVENTS_BODY_BYTES = 64 * 1024;

/**
 * The reader runs on a different origin to the live app, so the emitter's
 * `application/json` post is a preflighted cross-origin request. Nothing here
 * reads a cookie or a credential, so allowing any origin adds no risk that the
 * endpoint being public does not already carry.
 */
export const LIVE_EVENTS_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-max-age": "86400"
};

export interface IngestOptions {
  /** Called when part of a batch was dropped, so the app can log it. */
  onRejected?: (rejected: Rejection[]) => void;
}

/**
 * The content types a cross-site HTML form can produce without a preflight.
 * Mirrors SvelteKit's own list.
 */
const FORM_CONTENT_TYPES = ["application/x-www-form-urlencoded", "multipart/form-data", "text/plain"];

/**
 * Whether this is a cross-site form post.
 *
 * Exporting `OPTIONS` opts the route out of SvelteKit's cross-site form check,
 * which it has to do to accept a preflighted `application/json` post from the
 * reader on another origin. That protection is re-stated here rather than
 * dropped: a form post from somewhere else is refused exactly as it would have
 * been, while the JSON the emitter sends is let through.
 */
function isCrossSiteFormPost(request: Request): boolean {
  const type = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!FORM_CONTENT_TYPES.includes(type)) return false;
  return request.headers.get("origin") !== new URL(request.url).origin;
}

/** The preflight answer. */
export function ingestPreflight(): Response {
  return new Response(null, { status: 204, headers: LIVE_EVENTS_CORS_HEADERS });
}

/**
 * Validates a posted batch and publishes what survives.
 * @returns 202 when anything was published, and 403, 400 or 413 when nothing could be.
 */
export async function ingestRequest(request: Request, bus: Bus, options: IngestOptions = {}): Promise<Response> {
  if (isCrossSiteFormPost(request)) {
    return answer(403, { accepted: 0, rejected: 1, reason: "cross-site form post" });
  }

  const body = await request.text();
  if (body.length > MAX_EVENTS_BODY_BYTES) {
    return answer(413, { accepted: 0, rejected: 1, reason: "body too large" });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return answer(400, { accepted: 0, rejected: 1, reason: "body is not JSON" });
  }

  const { events, rejected } = parseLiveEvents(payload);
  if (events.length === 0 && rejected.length > 0) {
    options.onRejected?.(rejected);
    return answer(400, { accepted: 0, rejected: rejected.length, reasons: rejected.slice(0, 5), batchLimit: MAX_BATCH_SIZE });
  }

  await bus.publish(events);
  if (rejected.length > 0) options.onRejected?.(rejected);

  // 202: published, not yet stored. The consumer decides what it becomes.
  return answer(202, { accepted: events.length, rejected: rejected.length });
}

function answer(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...LIVE_EVENTS_CORS_HEADERS, "content-type": "application/json" }
  });
}
