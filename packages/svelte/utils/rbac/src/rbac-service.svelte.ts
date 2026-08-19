import { rune } from "@tutors/runes";
import { contentLocks, isEducator, tutorsId, currentCourse } from "@tutors/runes";
import type { Role, Permission } from "./types.ts";
import { roleHasPermission } from "./permissions.ts";
import { getLocksForCourse, upsertLock } from "./lock-store.ts";

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
    if (!courseId) return;

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
    checkLecturerStatus,
    clear
  };
}

export const rbacService = createRbacService();
