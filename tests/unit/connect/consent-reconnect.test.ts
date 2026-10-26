// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Signing in again reads the privacy choice this browser kept for that login: presence joins the open
 * course's roster only when it was allowed, and a course the person was opening before sign-in still opens.
 */

vi.mock("$app/env/public", () => ({
  PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
  PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
  PUBLIC_ANON_MODE: "FALSE"
}));

// Both aliases resolve to one test shim, so each mock carries both exports.
const nav = vi.hoisted(() => ({ browser: true, goto: vi.fn() }));
vi.mock("$app/env", () => nav);
vi.mock("$app/navigation", () => nav);

vi.mock("../../../packages/svelte/community/src/index.ts", () => ({
  analyticsService: { learningEvent: vi.fn(), reportPageLoad: vi.fn(), updatePageCount: vi.fn(), updateLogin: vi.fn() },
  presenceService: { startPresenceListener: vi.fn(), startCourseRoster: vi.fn(), stopPresenceListener: vi.fn(), sendLoEvent: vi.fn() }
}));

vi.mock("@tutors/community/utils/supabase-client", () => ({
  supabase: undefined,
  addOrUpdateStudent: vi.fn(() => Promise.resolve()),
  getTutorsConnectUserSentiment: vi.fn(() => Promise.resolve(null)),
  updateTutorsConnectUserOnlineStatus: vi.fn(() => Promise.resolve()),
  updateTutorsConnectUserSentiment: vi.fn(() => Promise.resolve())
}));

vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => {
  const rune = <T>(initial: T) => ({ value: initial });
  return {
    rune,
    currentCourse: rune<{ courseId: string } | null>(null),
    currentLo: rune(null),
    tutorsId: rune(null),
    isEducator: rune(false)
  };
});

import { goto } from "$app/navigation";
import { presenceService } from "../../../packages/svelte/community/src/index.ts";
import { currentCourse, tutorsId } from "../../../packages/svelte/runes/src/index.svelte.ts";
import { consent, saveConsent } from "../../../packages/svelte/utils/privacy/src/consent.ts";
import { tutorsConnectService } from "../../../packages/svelte/connect/src/services/connect.svelte.ts";

const user = { login: "alice", name: "Alice", email: "alice@example.com", image: "https://avatars.example/alice.png" };

describe("reconnect with a kept privacy choice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    currentCourse.value = { courseId: "cs101" } as never;
  });

  it("joins the open course's roster when presence was allowed", async () => {
    saveConsent("alice", { analytics: false, presence: true });
    await tutorsConnectService.reconnect(user as never);
    expect(tutorsId.value?.share).toBe("true");
    expect(consent.value).toMatchObject({ analytics: false, presence: true });
    expect(presenceService.startCourseRoster).toHaveBeenCalledWith("cs101");
  });

  it("stays offline when no choice was kept", async () => {
    await tutorsConnectService.reconnect(user as never);
    expect(tutorsId.value?.share).toBe("false");
    expect(consent.value).toBeNull();
    expect(presenceService.startCourseRoster).not.toHaveBeenCalled();
  });

  it("opens the course the person was signing in to, once", async () => {
    localStorage.loginCourse = "cs202";
    await tutorsConnectService.reconnect(user as never);
    expect(goto).toHaveBeenCalledWith("/course/cs202");
    expect(localStorage.loginCourse).toBeUndefined();
  });
});
