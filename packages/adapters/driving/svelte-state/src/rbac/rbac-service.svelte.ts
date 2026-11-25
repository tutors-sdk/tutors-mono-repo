import log from "@tutors/logger";
import type { Lo } from "@tutors/domain/course";
import {
  hasActiveLocks as locksActive,
  isLoLocked as loLocked,
  roleHasPermission,
  roleFor,
  showsLockedToStudents,
  SHOW_LOCKED_KEY,
  type LockChangeResult,
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
  // Routes with a lock change waiting for the server; Educator Control disables their switches (Rule 0658).
  const pendingLocks = rune<Set<string>>(new Set());
  // Set once the server answers that it has no lock database, so Educator Control says changes stay in this browser.
  const savedLocally = rune(false);
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
      // Whether the server keeps lock changes is learned again for each course.
      savedLocally.value = false;
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

  async function toggleContentLock(loRoute: string, locked: boolean): Promise<LockChangeResult> {
    const courseId = resolvedCourseId();
    const pendingKey = `${courseId}|${loRoute}`;
    // One change per lock at a time, so a late answer can never undo a newer change.
    if (!courseId || pendingLocks.value.has(pendingKey)) return "unsaved";

    // The course whose locks are on screen: an answer that arrives after the educator has moved to another
    // course must not touch that course's locks or the local-only notice.
    const shownCourseId = loadedLocksCourseId;
    const stillShown = () => loadedLocksCourseId === shownCourseId;
    const previous = contentLocks.value.get(loRoute);
    setPending(pendingKey, true);
    applyLock(courseId, loRoute, locked);
    try {
      const result = await setContentLock({ store: adapters().accessStore })(courseId, loRoute, locked);
      if (result === "saved") {
        if (stillShown()) savedLocally.value = false;
      } else if (result === "local") {
        if (stillShown()) savedLocally.value = true;
      } else {
        // Refused or unreachable: put the switch back so the panel shows what students see.
        applyLock(courseId, loRoute, previous, stillShown());
      }
      return result;
    } finally {
      setPending(pendingKey, false);
    }
  }

  function setPending(pendingKey: string, pending: boolean) {
    const updated = new Set(pendingLocks.value);
    if (pending) updated.add(pendingKey);
    else updated.delete(pendingKey);
    pendingLocks.value = updated;
  }

  function isLockPending(loRoute: string): boolean {
    return pendingLocks.value.has(`${resolvedCourseId()}|${loRoute}`);
  }

  /** Sets one lock in the course's localStorage copy and, when that course is on screen, in contentLocks too. */
  function applyLock(courseId: string, loRoute: string, locked: boolean | undefined, onScreen = true) {
    const updated = new Map(onScreen ? contentLocks.value : storedLocks(courseId));
    if (locked === undefined) updated.delete(loRoute);
    else updated.set(loRoute, locked);
    if (onScreen) contentLocks.value = updated;

    if (typeof window !== "undefined") {
      localStorage.setItem(`tutors-locks-${courseId}`, JSON.stringify(Object.fromEntries(updated)));
    }
  }

  function storedLocks(courseId: string): Map<string, boolean> {
    if (typeof window === "undefined") return new Map();
    try {
      return new Map(Object.entries(JSON.parse(localStorage.getItem(`tutors-locks-${courseId}`) ?? "{}") as Record<string, boolean>));
    } catch {
      return new Map();
    }
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

  function setShowLockedToStudents(show: boolean): Promise<LockChangeResult> {
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
    pendingLocks.value = new Set();
    savedLocally.value = false;
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

    /** Whether lock changes are kept only in this browser because the server has no lock database. */
    get locksSavedLocally(): boolean {
      return savedLocally.value;
    },

    loadRole,
    hasPermission,
    loadContentLocks,
    toggleContentLock,
    isLockPending,
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
