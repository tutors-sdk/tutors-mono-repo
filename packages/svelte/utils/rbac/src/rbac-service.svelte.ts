import { rune } from "@tutors/runes";
import { contentLocks, isEducator, locksLoaded, tutorsId, currentCourse } from "@tutors/runes";
import type { Lo } from "@tutors/tutors-model-lib";
import type { Role, Permission } from "./types.ts";
import { roleHasPermission } from "./permissions.ts";
import { getLocksForCourse, upsertLock } from "./lock-store.ts";

function normalizeRoute(route: string): string {
  return route.replace(/\/+$/, "");
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

  function resolvedUserId(): string {
    return currentUserId.value || tutorsId.value?.login || "dev-user";
  }

  function hasPermission(permission: Permission): boolean {
    return roleHasPermission(currentRole.value, permission);
  }

  async function loadContentLocks(courseId: string): Promise<void> {
    if (!courseId) {
      locksLoaded.value = true;
      return;
    }
    locksLoaded.value = false;

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
    locksLoaded.value = true;
  }

  async function toggleContentLock(loRoute: string, locked: boolean): Promise<boolean> {
    const courseId = resolvedCourseId();
    const userId = resolvedUserId();
    if (!courseId) return false;

    const updated = new Map(contentLocks.value);
    updated.set(loRoute, locked);
    contentLocks.value = updated;

    if (typeof window !== "undefined") {
      localStorage.setItem(`tutors-locks-${courseId}`, JSON.stringify(Object.fromEntries(updated)));
    }

    upsertLock(courseId, loRoute, locked, userId);
    return true;
  }

  function isLocked(loRoute: string): boolean {
    return contentLocks.value.get(loRoute) === true;
  }

  function isLoLocked(lo: Lo): boolean {
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
    for (const locked of contentLocks.value.values()) {
      if (locked) return true;
    }
    return false;
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
    checkLecturerStatus,
    clear
  };
}

export const rbacService = createRbacService();
