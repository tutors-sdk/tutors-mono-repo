import log from "@tutors/logger";
import { rune } from "@tutors/runes";
import { contentLocks, isEducator, locksLoaded, tutorsId, currentCourse } from "@tutors/runes";
import type { Lo } from "@tutors/tutors-model-lib";
import type { Role, Permission } from "./types.ts";
import { roleHasPermission } from "./permissions.ts";
import { getLocksForCourse, upsertLock } from "./lock-store.ts";

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
export function isLoRouteLocked(
  loRoute: string,
  locks: Map<string, boolean>,
): boolean {
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

function createRbacService() {
  const currentRole = rune<Role>("student");
  const currentUserId = rune("");
  const currentCourseId = rune("");
  let loadedLocksCourseId = "";

  function loadRole(userId: string, courseId: string, course?: { enrollment?: { educators?: string[] } }): void {
    if (!userId || !courseId) {
      currentRole.value = "student";
      currentUserId.value = "";
      currentCourseId.value = "";
      return;
    }

    currentUserId.value = userId;
    currentCourseId.value = courseId;

    const educators = course?.enrollment?.educators ?? currentCourse.value?.enrollment?.educators ?? [];
    currentRole.value = educators.includes(userId) ? "educator" : "student";
  }

  function resolvedCourseId(): string {
    return currentCourseId.value || currentCourse.value?.courseId || "";
  }

  function hasPermission(permission: Permission): boolean {
    return roleHasPermission(currentRole.value, permission);
  }

  async function loadContentLocks(courseId: string): Promise<void> {
    if (!courseId) {
      locksLoaded.value = true;
      loadedLocksCourseId = "";
      return;
    }
    // Only clear the loaded flag when switching courses — avoids TOC remount loops
    // for enrolled students while locks are refreshed for the same course.
    if (loadedLocksCourseId !== courseId) {
      locksLoaded.value = false;
    }

    try {
      const locks = await getLocksForCourse(courseId);
      const lockMap = new Map<string, boolean>();

      if (locks.length > 0) {
        locks.forEach((lock) => lockMap.set(lock.lo_route, lock.locked));
      } else if (typeof window !== "undefined") {
        const stored = localStorage.getItem(`tutors-locks-${courseId}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as Record<string, boolean>;
            Object.entries(parsed).forEach(([route, locked]) => lockMap.set(route, locked));
          } catch { /* ignore parse errors */ }
        }
      }

      contentLocks.value = lockMap;
    } catch (error) {
      // Never reject: callers fire this without awaiting, and an unhandled
      // rejection here would surface as a console error on every course visit.
      log.error("loadContentLocks failed:", error);
      contentLocks.value = new Map();
    } finally {
      locksLoaded.value = true;
      loadedLocksCourseId = courseId;
    }
  }

  async function toggleContentLock(loRoute: string, locked: boolean): Promise<boolean> {
    const courseId = resolvedCourseId();
    if (!courseId) return false;

    const updated = new Map(contentLocks.value);
    updated.set(loRoute, locked);
    contentLocks.value = updated;

    if (typeof window !== "undefined") {
      localStorage.setItem(`tutors-locks-${courseId}`, JSON.stringify(Object.fromEntries(updated)));
    }

    void upsertLock(courseId, loRoute, locked);
    return true;
  }

  function isLocked(loRoute: string): boolean {
    return contentLocks.value.get(loRoute) === true;
  }

  function isLoLocked(lo: Lo): boolean {
    // Course home remains reachable even if a stale lock exists on the course route.
    if (lo.type === "course") return false;

    const locks = contentLocks.value;
    if (lo.route && isLoRouteLocked(lo.route, locks)) return true;
    if (lo.video && lo.video !== lo.route && isLoRouteLocked(lo.video, locks)) return true;
    return false;
  }

  function isLoVisibleToStudent(lo: Lo): boolean {
    if (lo.hide) return false;
    if (isEducator.value || !currentCourse.value?.hasEnrollment) return true;
    if (!locksLoaded.value) return false;
    return !isLoLocked(lo);
  }

  function hasActiveLocks(): boolean {
    for (const [route, locked] of contentLocks.value) {
      if (locked && route !== SHOW_LOCKED_KEY) return true;
    }
    return false;
  }

  /** Whether the lecturer chose to show locked content to students (greyed out) rather than hide it. */
  function showLockedToStudents(): boolean {
    return contentLocks.value.get(SHOW_LOCKED_KEY) === true;
  }

  function setShowLockedToStudents(show: boolean): Promise<boolean> {
    return toggleContentLock(SHOW_LOCKED_KEY, show);
  }

  /**
   * Whether a resource gets a card for this viewer. Hidden resources never do. A locked one does for a
   * lecturer (greyed, with Unlock), and for a student only when the lecturer shows locked content (greyed,
   * no link); otherwise it is left out, as it is from the course tree and the LLM export.
   */
  function isLoCardVisible(lo: Lo): boolean {
    if (lo.hide) return false;
    return isEducator.value || !isLoLocked(lo) || showLockedToStudents();
  }

  function checkLecturerStatus(course?: { enrollment?: { educators?: string[] } }): void {
    const login = tutorsId.value?.login;
    const educators = course?.enrollment?.educators ?? currentCourse.value?.enrollment?.educators ?? [];
    if (!login || educators.length === 0) {
      isEducator.value = false;
      return;
    }
    isEducator.value = educators.includes(login);
  }

  function clear(): void {
    currentRole.value = "student";
    currentUserId.value = "";
    currentCourseId.value = "";
    contentLocks.value = new Map();
    isEducator.value = false;
    // Lock state is known - there are none - so consumers must not treat this as pending.
    locksLoaded.value = true;
    loadedLocksCourseId = "";
  }

  return {
    currentRole,

    get role(): Role {
      return currentRole.value;
    },

    get isEducator(): boolean {
      return currentRole.value === "educator";
    },

    loadRole,
    hasPermission,
    loadContentLocks,
    toggleContentLock,
    isLocked,
    isLoLocked,
    isLoVisibleToStudent,
    hasActiveLocks,
    showLockedToStudents,
    setShowLockedToStudents,
    isLoCardVisible,
    checkLecturerStatus,
    clear
  };
}

export const rbacService = createRbacService();
