import log from "@tutors/logger";
import type { Lo } from "@tutors/domain/course";
import {
  hasActiveLocks as locksActive,
  isLoLocked as loLocked,
  roleHasPermission,
  roleFor,
  showsLockedToStudents,
  SHOW_LOCKED_KEY,
  type Permission,
  type Role
} from "@tutors/domain/access";
import { loadContentLocks as loadLocks, setContentLock } from "@tutors/application";
import { adapters } from "../adapters.ts";
import { rune } from "../index.svelte.ts";
import { contentLocks, isEducator, locksLoaded, tutorsId, currentCourse } from "../index.svelte.ts";

export { isLoRouteLocked, SHOW_LOCKED_KEY } from "@tutors/domain/access";

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

    currentRole.value = roleFor(userId, course?.enrollment ?? currentCourse.value?.enrollment);
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
      loadedLocksCourseId = "";
      return;
    }
    // Only clear the loaded flag when switching courses — avoids TOC remount loops
    // for enrolled students while locks are refreshed for the same course.
    if (loadedLocksCourseId !== courseId) {
      locksLoaded.value = false;
    }

    try {
      const lockMap = await loadLocks({ store: adapters().accessStore })(courseId);

      if (lockMap.size === 0 && typeof window !== "undefined") {
        const stored = localStorage.getItem(`tutors-locks-${courseId}`);
        if (stored) {
          try {
            const parsed = JSON.parse(stored) as Record<string, boolean>;
            Object.entries(parsed).forEach(([route, locked]) => lockMap.set(route, locked));
          } catch {
            /* ignore parse errors */
          }
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
    const userId = resolvedUserId();
    if (!courseId) return false;

    const updated = new Map(contentLocks.value);
    updated.set(loRoute, locked);
    contentLocks.value = updated;

    if (typeof window !== "undefined") {
      localStorage.setItem(`tutors-locks-${courseId}`, JSON.stringify(Object.fromEntries(updated)));
    }

    void setContentLock({ store: adapters().accessStore })(courseId, loRoute, locked, userId);
    return true;
  }

  function isLocked(loRoute: string): boolean {
    return contentLocks.value.get(loRoute) === true;
  }

  function isLoLocked(lo: Lo): boolean {
    return loLocked(lo, contentLocks.value);
  }

  function isLoVisibleToStudent(lo: Lo): boolean {
    if (lo.hide) return false;
    if (isEducator.value || !currentCourse.value?.hasEnrollment) return true;
    if (!locksLoaded.value) return false;
    return !isLoLocked(lo);
  }

  function hasActiveLocks(): boolean {
    return locksActive(contentLocks.value);
  }

  /** Whether the lecturer chose to show locked content to students (greyed out) rather than hide it. */
  function showLockedToStudents(): boolean {
    return showsLockedToStudents(contentLocks.value);
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
