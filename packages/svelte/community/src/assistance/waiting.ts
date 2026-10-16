/**
 * Time in the queue, always from the clock (Rule 0387): how long a request has waited, when a
 * lecturer request escalates (Rule 0388), when a forgotten request withdraws itself,
 * and the order a lecturer sees them in.
 */
import { isLive, type HelpRequest } from "./help-request.ts";

const MINUTE = 60 * 1000;
export const ESCALATE_AFTER_MS = 5 * MINUTE;
export const URGENT_AFTER_MS = 10 * MINUTE;
/** A request still live 4 hours after it was raised withdraws itself. */
export const EXPIRE_AFTER_MS = 4 * 60 * MINUTE;

/** The instant the request started waiting, in milliseconds. */
export function waitingSince(request: HelpRequest): number {
  return Date.parse(request.requestedAt);
}

/** How long the request has waited at `nowMs`; never negative. */
export function waitingMs(request: HelpRequest, nowMs: number): number {
  return Math.max(0, nowMs - waitingSince(request));
}

export type Escalation = "none" | "escalated" | "urgent";

/**
 * A live lecturer request that has waited more than 5 minutes is escalated, more than 10 urgent.
 * Other kinds, and requests no longer live, do not escalate.
 */
export function shouldEscalate(request: HelpRequest, nowMs: number): Escalation {
  if (request.kind !== "lecturer" || !isLive(request)) return "none";
  const waited = waitingMs(request, nowMs);
  if (waited > URGENT_AFTER_MS) return "urgent";
  if (waited > ESCALATE_AFTER_MS) return "escalated";
  return "none";
}

/** True when a live request has waited 4 hours or more and should withdraw itself. */
export function shouldExpire(request: HelpRequest, nowMs: number): boolean {
  return isLive(request) && waitingMs(request, nowMs) >= EXPIRE_AFTER_MS;
}

/** Lecturer requests first, then the longest waiting first; ties by id so the order is stable. */
export function queueOrder(a: HelpRequest, b: HelpRequest): number {
  const lecturer = Number(b.kind === "lecturer") - Number(a.kind === "lecturer");
  return lecturer || waitingSince(a) - waitingSince(b) || a.id.localeCompare(b.id);
}
