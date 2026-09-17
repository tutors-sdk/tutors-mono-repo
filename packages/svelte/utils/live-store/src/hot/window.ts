import type { Service } from "@tutors/live-events";
import type { CourseNow, NowSnapshot, ServiceCount } from "../types.ts";

/**
 * Presence is a windowed view, not a running total: a session is "active now"
 * only while its last event is inside the window. Both hot stores share these
 * rules so the memory adapter and Valkey cannot drift apart.
 */

/** A session is active while it has been seen inside this window. */
export const ACTIVE_WINDOW_MS = 2 * 60 * 1000;

/** Service touches are counted over a slightly longer window, so the mix is not all zeroes between beats. */
export const SERVICE_WINDOW_MS = 5 * 60 * 1000;

/** One session's last known position. */
export interface Presence {
  sid: string;
  course: string;
  lo?: string;
  /** Epoch ms of the last event from this session. */
  at: number;
}

/** One service touch, kept only for as long as the service window. */
export interface Touch {
  service: Service;
  sid: string;
  at: number;
}

/** Builds the snapshot the `now` endpoint returns from the raw window contents. */
export function snapshotOf(presences: Presence[], touches: Touch[], at: Date): NowSnapshot {
  const cutoff = at.getTime() - ACTIVE_WINDOW_MS;
  const live = presences.filter((presence) => presence.at >= cutoff);

  const byCourse = new Map<string, Presence[]>();
  for (const presence of live) {
    const bucket = byCourse.get(presence.course);
    if (bucket) bucket.push(presence);
    else byCourse.set(presence.course, [presence]);
  }

  const courses: CourseNow[] = [...byCourse.entries()]
    .map(([course, sessions]) => ({
      course,
      active: new Set(sessions.map((session) => session.sid)).size,
      los: countLos(sessions)
    }))
    .sort((a, b) => b.active - a.active || a.course.localeCompare(b.course));

  const serviceCutoff = at.getTime() - SERVICE_WINDOW_MS;
  const services = countServices(touches.filter((touch) => touch.at >= serviceCutoff));

  return {
    activeSessions: new Set(live.map((presence) => presence.sid)).size,
    courses,
    services,
    updatedAt: at.toISOString()
  };
}

function countLos(sessions: Presence[]): { lo: string; count: number }[] {
  const counts = new Map<string, Set<string>>();
  for (const session of sessions) {
    if (!session.lo) continue;
    const sids = counts.get(session.lo) ?? new Set<string>();
    sids.add(session.sid);
    counts.set(session.lo, sids);
  }
  return [...counts.entries()]
    .map(([lo, sids]) => ({ lo, count: sids.size }))
    .sort((a, b) => b.count - a.count || a.lo.localeCompare(b.lo));
}

function countServices(touches: Touch[]): ServiceCount[] {
  const counts = new Map<Service, number>();
  for (const touch of touches) counts.set(touch.service, (counts.get(touch.service) ?? 0) + 1);
  return [...counts.entries()]
    .map(([service, count]) => ({ service, count }))
    .sort((a, b) => b.count - a.count || a.service.localeCompare(b.service));
}
