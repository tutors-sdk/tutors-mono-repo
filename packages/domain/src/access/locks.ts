import type { Lo } from "../course/types/index.ts";

export interface ContentLock {
  id?: string;
  course_id: string;
  lo_route: string;
  locked: boolean;
  locked_by: string;
  locked_at?: string;
}

/**
 * The lecturer's per-course "show locked content to students" setting. It is stored as a reserved row in the
 * locks table, so every visitor's browser already reads it with the course's locks and lecturers can already
 * write it. It is not a route: route matching below never treats it as a lock.
 */
export const SHOW_LOCKED_KEY = "@settings/show-locked";

/** Drops trailing slashes. A loop, not /\/+$/, which backtracks polynomially on long runs of "/" (CodeQL js/polynomial-redos). */
function normalizeRoute(route: string): string {
  let end = route.length;
  while (end > 0 && route[end - 1] === "/") end--;
  return route.slice(0, end);
}

function isRouteLocked(route: string, locks: Map<string, boolean>): boolean {
  if (!route) return false;
  const normalized = normalizeRoute(route);
  return locks.get(route) === true || locks.get(normalized) === true;
}

/** Path after the LO-type segment, e.g. `/lab/cs101/week-01` → `cs101/week-01`. */
function routePathAfterType(route: string): string {
  const parts = normalizeRoute(route).split("/").filter(Boolean);
  return parts.slice(1).join("/");
}

/** Returns true if loRoute matches any locked route (exact or descendant). */
export function isLoRouteLocked(loRoute: string, locks: Map<string, boolean>): boolean {
  if (!loRoute) return false;

  const normalized = normalizeRoute(loRoute);
  if (isRouteLocked(normalized, locks)) return true;

  const loPath = routePathAfterType(normalized);
  if (!loPath) return false;

  for (const [route, locked] of locks) {
    if (!locked) continue;
    const lockPath = routePathAfterType(route);
    // Require course id + at least one segment so `/topic/{courseId}` cannot lock the whole course.
    if (!lockPath || lockPath.split("/").length < 2) continue;
    if (loPath === lockPath || loPath.startsWith(`${lockPath}/`)) {
      return true;
    }
  }
  return false;
}

/** True when a lock on the learning object's route, or on its video route, keeps students out. The course home is never locked. */
export function isLoLocked(lo: Lo, locks: Map<string, boolean>): boolean {
  // Course home remains reachable even if a stale lock exists on the course route.
  if (lo.type === "course") return false;
  if (lo.route && isLoRouteLocked(lo.route, locks)) return true;
  if (lo.video && lo.video !== lo.route && isLoRouteLocked(lo.video, locks)) return true;
  return false;
}

/** True when any route (the settings row aside) is locked. */
export function hasActiveLocks(locks: Map<string, boolean>): boolean {
  for (const [route, locked] of locks) {
    if (locked && route !== SHOW_LOCKED_KEY) return true;
  }
  return false;
}

/** Whether the lecturer chose to show locked content to students (greyed out) rather than hide it. */
export function showsLockedToStudents(locks: Map<string, boolean>): boolean {
  return locks.get(SHOW_LOCKED_KEY) === true;
}

/** The lock map a stored list of locks gives. */
export function lockMapOf(locks: ContentLock[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const lock of locks) map.set(lock.lo_route, lock.locked);
  return map;
}
