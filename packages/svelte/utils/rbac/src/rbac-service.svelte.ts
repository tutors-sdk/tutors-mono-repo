import { rune } from "@tutors/runes";
import { contentLocks, isLecturer, courseLecturers, tutorsId, currentCourse, enrolledUsers } from "@tutors/runes";
import type { Role, Permission } from "./types.ts";
import { roleHasPermission } from "./permissions.ts";
import { getUserRole } from "./role-store.ts";
import { getLocksForCourse, upsertLock } from "./lock-store.ts";

function createRbacService() {
  const currentRole = rune<Role>("student");
  const currentUserId = rune("");
  const currentCourseId = rune("");
  const loading = rune(false);

  async function loadRole(userId: string, courseId: string): Promise<void> {
    if (!userId || !courseId) {
      currentRole.value = "student";
      currentUserId.value = "";
      currentCourseId.value = "";
      return;
    }

    if (userId === currentUserId.value && courseId === currentCourseId.value) {
      return;
    }

    loading.value = true;
    try {
      const role = await getUserRole(userId, courseId);
      currentRole.value = role;
      currentUserId.value = userId;
      currentCourseId.value = courseId;
    } finally {
      loading.value = false;
    }
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

  function checkLecturerStatus(): void {
    const login = tutorsId.value?.login;
    if (!login || courseLecturers.value.length === 0) {
      isLecturer.value = false;
      return;
    }
    isLecturer.value = courseLecturers.value.includes(login);
  }

  function loadEnrolledUsers(courseId: string): void {
    if (!courseId || typeof window === "undefined") return;
    const stored = localStorage.getItem(`tutors-enrolled-${courseId}`);
    if (stored) {
      try {
        enrolledUsers.value = JSON.parse(stored) as string[];
      } catch { enrolledUsers.value = []; }
    } else {
      enrolledUsers.value = [];
    }
  }

  function addEnrolledUser(username: string, courseId?: string): void {
    const cid = courseId || resolvedCourseId();
    if (!cid || !username) return;
    const trimmed = username.trim().toLowerCase();
    if (!trimmed || enrolledUsers.value.includes(trimmed)) return;
    enrolledUsers.value = [...enrolledUsers.value, trimmed];
    if (typeof window !== "undefined") {
      localStorage.setItem(`tutors-enrolled-${cid}`, JSON.stringify(enrolledUsers.value));
    }
  }

  function removeEnrolledUser(username: string, courseId?: string): void {
    const cid = courseId || resolvedCourseId();
    if (!cid) return;
    enrolledUsers.value = enrolledUsers.value.filter((u) => u !== username);
    if (typeof window !== "undefined") {
      localStorage.setItem(`tutors-enrolled-${cid}`, JSON.stringify(enrolledUsers.value));
    }
  }

  function clear(): void {
    currentRole.value = "student";
    currentUserId.value = "";
    currentCourseId.value = "";
    contentLocks.value = new Map();
    isLecturer.value = false;
    courseLecturers.value = [];
    enrolledUsers.value = [];
  }

  return {
    currentRole,
    loading,

    get role(): Role {
      return currentRole.value;
    },

    get isEducator(): boolean {
      return currentRole.value === "educator" || currentRole.value === "admin";
    },

    get isAdmin(): boolean {
      return currentRole.value === "admin";
    },

    loadRole,
    hasPermission,
    loadContentLocks,
    toggleContentLock,
    isLocked,
    checkLecturerStatus,
    loadEnrolledUsers,
    addEnrolledUser,
    removeEnrolledUser,
    clear
  };
}

export const rbacService = createRbacService();
