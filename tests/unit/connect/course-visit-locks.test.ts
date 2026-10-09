import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Course } from "@tutors/tutors-model-lib";

/**
 * Content locks gate what an enrolled student can see, so `courseVisit` must
 * load them before the anonymous-mode early return. Otherwise `locksLoaded`
 * never becomes true and every card, wall and TOC entry stays hidden.
 */

vi.mock("$env/dynamic/public", () => ({
  env: {
    PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
    PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
    PUBLIC_ANON_MODE: "TRUE"
  }
}));

vi.mock("$app/env", () => ({ browser: false }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

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

describe("injected identity client", () => {
  it("delegates sign-in and sign-out without adding provider options", async () => {
    const signIn = vi.fn(async () => {});
    const signOut = vi.fn(async () => {});
    tutorsConnectService.identityClient = { signIn, signOut };
    await tutorsConnectService.connect("/course/cs101");
    await tutorsConnectService.disconnect("/");
    expect(signIn).toHaveBeenCalledWith("/course/cs101");
    expect(signOut).toHaveBeenCalledWith("/");
  });

  it("propagates provider errors to the caller", async () => {
    const error = new Error("Sign-in failed");
    tutorsConnectService.identityClient = { signIn: vi.fn().mockRejectedValue(error), signOut: vi.fn().mockRejectedValue(error) };
    await expect(tutorsConnectService.connect("/")).rejects.toBe(error);
    await expect(tutorsConnectService.disconnect("/")).rejects.toBe(error);
  });

  it("requires the application to configure a client", async () => {
    tutorsConnectService.identityClient = null;
    await expect(tutorsConnectService.connect("/")).rejects.toThrow("Identity client is not configured");
    await expect(tutorsConnectService.disconnect("/")).rejects.toThrow("Identity client is not configured");
  });
});
