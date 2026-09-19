import { isService } from "./catalogue.ts";
import { EVENT_TYPES, type LiveEvent, type LiveEventType } from "./events.ts";

/**
 * Validation for events arriving from a browser. The ingest endpoint is public
 * and unauthenticated by design (§10: no identity is required to be counted),
 * so nothing here trusts the caller: unknown fields are dropped, every string
 * is length-bounded and a bad event is rejected rather than repaired.
 */

/** Longest accepted value for an id-like field (sid, course, lo, uid). */
export const MAX_FIELD_LENGTH = 256;

/** Largest batch the ingest endpoint accepts in one request. */
export const MAX_BATCH_SIZE = 50;

/** A rejected event, with the reason, for logging and the `rejected` metric. */
export interface Rejection {
  index: number;
  reason: string;
}

function isEventType(value: unknown): value is LiveEventType {
  return typeof value === "string" && (EVENT_TYPES as readonly string[]).includes(value);
}

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_FIELD_LENGTH) return undefined;
  return trimmed;
}

/** An ISO 8601 instant, or undefined when the value is not a usable timestamp. */
function timestamp(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return undefined;
  return new Date(ms).toISOString();
}

/**
 * Coarsens an ISO timestamp to the minute (§10). Applied before an event is
 * written to storage, never to the hot store, which needs the second to decide
 * whether a session is still active.
 */
export function coarsenToMinute(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new RangeError(`not a timestamp: ${iso}`);
  const date = new Date(ms);
  date.setUTCSeconds(0, 0);
  return date.toISOString();
}

/**
 * Validates one event.
 * @returns the event with only its known fields, or a reason it was rejected.
 */
export function parseLiveEvent(raw: unknown): { event: LiveEvent } | { reason: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { reason: "not an object" };
  const input = raw as Record<string, unknown>;

  if (!isEventType(input.type)) return { reason: `unknown type: ${String(input.type)}` };
  const ts = timestamp(input.ts);
  if (!ts) return { reason: "invalid ts" };
  const sid = str(input.sid);
  if (!sid) return { reason: "invalid sid" };
  const course = str(input.course);
  if (!course) return { reason: "invalid course" };

  const base = { ts, sid, course };

  switch (input.type) {
    case "session.started": {
      const uid = input.uid === undefined ? undefined : str(input.uid);
      if (input.uid !== undefined && !uid) return { reason: "invalid uid" };
      return { event: { ...base, type: "session.started", ...(uid ? { uid } : {}) } };
    }
    case "session.heartbeat": {
      const lo = input.lo === undefined ? undefined : str(input.lo);
      if (input.lo !== undefined && !lo) return { reason: "invalid lo" };
      return { event: { ...base, type: "session.heartbeat", ...(lo ? { lo } : {}) } };
    }
    case "course.opened":
      return { event: { ...base, type: "course.opened" } };
    case "lo.viewed": {
      const lo = str(input.lo);
      if (!lo) return { reason: "invalid lo" };
      const loType = str(input.loType);
      if (!loType) return { reason: "invalid loType" };
      return { event: { ...base, type: "lo.viewed", lo, loType } };
    }
    case "service.used": {
      if (!isService(input.service)) return { reason: `unknown service: ${String(input.service)}` };
      return { event: { ...base, type: "service.used", service: input.service } };
    }
    case "session.ended": {
      const durationSec = input.durationSec;
      if (typeof durationSec !== "number" || !Number.isFinite(durationSec) || durationSec < 0) {
        return { reason: "invalid durationSec" };
      }
      return { event: { ...base, type: "session.ended", durationSec: Math.round(durationSec) } };
    }
    default:
      return { reason: `unknown type: ${String(input.type)}` };
  }
}

/**
 * Validates a batch, keeping the good events and reporting the rest. A single
 * malformed event never costs the caller the whole batch.
 */
export function parseLiveEvents(raw: unknown): { events: LiveEvent[]; rejected: Rejection[] } {
  if (!Array.isArray(raw)) return { events: [], rejected: [{ index: 0, reason: "not an array" }] };
  if (raw.length > MAX_BATCH_SIZE) return { events: [], rejected: [{ index: 0, reason: `batch larger than ${MAX_BATCH_SIZE}` }] };

  const events: LiveEvent[] = [];
  const rejected: Rejection[] = [];
  raw.forEach((candidate, index) => {
    const result = parseLiveEvent(candidate);
    if ("event" in result) events.push(result.event);
    else rejected.push({ index, reason: result.reason });
  });
  return { events, rejected };
}
