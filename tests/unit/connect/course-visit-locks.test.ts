import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Course } from "@tutors/tutors-model-lib";

/**
 * Content locks gate what an enrolled student can see, so `courseVisit` must
 * load them before the anonymous-mode early return. Otherwise `locksLoaded`
 * never becomes true and every card, wall and TOC entry stays hidden.
 */

vi.mock("$env/static/public", () => ({
  PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
  PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
  PUBLIC_ANON_MODE: "TRUE"
}));

vi.mock("$app/environment", () => ({ browser: false }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));
vi.mock("@auth/sveltekit/client", () => ({ signIn: vi.fn(), signOut: vi.fn() }));

vi.mock("../../../packages/svelte/community/src/index.ts", () => ({
  analyticsService: { learningEvent: vi.fn(), reportPageLoad: vi.fn(), updatePageCount: vi.fn(), updateLogin: vi.fn() },
  presenceService: { startPresenceListener: vi.fn(), sendLoEvent: vi.fn() }
}));

vi.mock("@tutors/community/utils/supabase-client", () => ({
  supabase: undefined,
  addOrUpdateStudent: vi.fn(),
  getTutorsConnectUserOnlineStatus: vi.fn(),
  getTutorsConnectUserSentiment: vi.fn(),
  updateTutorsConnectUserOnlineStatus: vi.fn(),
  updateTutorsConnectUserSentiment: vi.fn()
}));

vi.mock("../../../packages/svelte/connect/src/services/localStorageProfile.ts", () => ({
  localStorageProfile: { logCourseVisit: vi.fn(), reloadProfile: vi.fn() }
}));

vi.mock("../../../packages/svelte/connect/src/services/supabaseProfile.svelte.ts", () => ({
  supabaseProfile: { logCourseVisit: vi.fn(), reloadProfile: vi.fn() }
}));

vi.mock("../../../packages/svelte/connect/src/utils/allCourseAccess.ts", () => ({
  updateCourseList: vi.fn()
}));

vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => {
  const rune = <T>(initial: T) => ({ value: initial });
  return {
    rune,
    currentCourse: rune(null),
    currentLo: rune(null),
    tutorsId: rune(null),
    isEducator: rune(false)
  };
});

vi.mock("../../../packages/svelte/utils/rbac/src/index.ts", () => ({
  rbacService: {
    loadContentLocks: vi.fn(() => Promise.resolve()),
    clear: vi.fn(),
    loadRole: vi.fn(),
    checkLecturerStatus: vi.fn()
  }
}));

import { tutorsConnectService } from "../../../packages/svelte/connect/src/services/connect.svelte.ts";
import { rbacService } from "../../../packages/svelte/utils/rbac/src/index.ts";

const enrolledCourse = { courseId: "cs101", hasEnrollment: true, authLevel: 0 } as unknown as Course;
const openCourse = { courseId: "cs102", hasEnrollment: false, authLevel: 0 } as unknown as Course;

describe("courseVisit in anonymous mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads content locks for an enrolment course", () => {
    tutorsConnectService.courseVisit(enrolledCourse);
    expect(rbacService.loadContentLocks).toHaveBeenCalledWith("cs101");
  });

  it("clears lock state for a course without enrolment", () => {
    tutorsConnectService.courseVisit(openCourse);
    expect(rbacService.clear).toHaveBeenCalled();
    expect(rbacService.loadContentLocks).not.toHaveBeenCalled();
  });

  it("still skips analytics and role resolution", () => {
    tutorsConnectService.courseVisit(enrolledCourse);
    expect(rbacService.loadRole).not.toHaveBeenCalled();
    expect(rbacService.checkLecturerStatus).not.toHaveBeenCalled();
  });
});
