import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The learner's sharing choice and what follows from it: the browser's stored choice, the roster of
 * who is on the course, and the learner's record. The roster and the record are spies; the choice is
 * read back from the same places the reader reads it.
 */
const seams = vi.hoisted(() => ({
  goto: vi.fn(),
  startCourseRoster: vi.fn(async () => {}),
  stopPresenceListener: vi.fn(),
  updateLogin: vi.fn(async () => {}),
  logError: vi.fn(),
  currentCourse: { value: null as { courseId: string } | null },
  currentLo: { value: null as unknown },
  tutorsId: { value: null as Record<string, unknown> | null }
}));

// Both names resolve to one stub module under the unit config, so each mock carries both exports.
vi.mock("$app/env", () => ({ browser: true, goto: seams.goto }));
vi.mock("$app/navigation", () => ({ browser: true, goto: seams.goto }));
vi.mock("@tutors/logger", () => ({ default: { error: seams.logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock("../../../packages/adapters/driving/svelte-state/src/community/index.ts", () => ({
  analyticsService: { updateLogin: seams.updateLogin, updatePageCount: vi.fn() },
  presenceService: { startCourseRoster: seams.startCourseRoster, stopPresenceListener: seams.stopPresenceListener }
}));
vi.mock("../../../packages/adapters/driving/svelte-state/src/index.svelte.ts", () => ({
  currentCourse: seams.currentCourse,
  currentLo: seams.currentLo,
  tutorsId: seams.tutorsId,
  isEducator: { value: false }
}));
vi.mock("../../../packages/adapters/driving/svelte-state/src/rbac/index.ts", () => ({ rbacService: {} }));

import { InMemoryProfile } from "../../../packages/application/src/testing/index.ts";
import { anonymousAdapters, configureAdapters } from "../../../packages/adapters/driving/svelte-state/src/adapters.ts";
import { tutorsConnectService } from "../../../packages/adapters/driving/svelte-state/src/connect/services/connect.svelte.ts";

let stored: Record<string, unknown> & { removeItem(key: string): void };
let record: InMemoryProfile;
let setSharing: ReturnType<typeof vi.spyOn>;

function signedIn(share: string, login = "alice") {
  seams.tutorsId.value = { login, share };
}

beforeEach(() => {
  vi.clearAllMocks();
  stored = {
    removeItem(key: string) {
      delete stored[key];
    }
  };
  vi.stubGlobal("localStorage", stored);
  record = new InMemoryProfile();
  setSharing = vi.spyOn(record, "setSharing");
  configureAdapters({ ...anonymousAdapters(), anonymous: false, profile: { local: new InMemoryProfile(), signedIn: record } });
  seams.currentCourse.value = { courseId: "cs101" };
  seams.tutorsId.value = null;
});

describe("toggleShare", () => {
  it("turns sharing off: the choice is stored, the roster stops and the record says so", () => {
    signedIn("true");
    tutorsConnectService.toggleShare();
    expect(seams.tutorsId.value?.share).toBe("false");
    expect(stored.share).toBe("false");
    expect(seams.stopPresenceListener).toHaveBeenCalledTimes(1);
    expect(seams.startCourseRoster).not.toHaveBeenCalled();
    expect(setSharing).toHaveBeenCalledWith("alice", false);
  });

  it("turns sharing on: the choice is stored, the course's roster starts and the record says so", () => {
    signedIn("false");
    tutorsConnectService.toggleShare();
    expect(seams.tutorsId.value?.share).toBe("true");
    expect(stored.share).toBe("true");
    expect(seams.startCourseRoster).toHaveBeenCalledWith("cs101");
    expect(seams.stopPresenceListener).not.toHaveBeenCalled();
    expect(setSharing).toHaveBeenCalledWith("alice", true);
  });

  it("starts no roster when no course is open", () => {
    signedIn("false");
    seams.currentCourse.value = null;
    tutorsConnectService.toggleShare();
    expect(seams.startCourseRoster).not.toHaveBeenCalled();
    expect(seams.stopPresenceListener).toHaveBeenCalledTimes(1);
    expect(setSharing).toHaveBeenCalledWith("alice", true);
  });

  it("starts no roster and writes no record for a visitor with no login", () => {
    signedIn("false", "");
    tutorsConnectService.toggleShare();
    expect(stored.share).toBe("true");
    expect(seams.startCourseRoster).not.toHaveBeenCalled();
    expect(seams.stopPresenceListener).toHaveBeenCalledTimes(1);
    expect(setSharing).not.toHaveBeenCalled();
  });

  it("writes no record in an anonymous deployment", () => {
    configureAdapters({ anonymous: true });
    signedIn("true");
    tutorsConnectService.toggleShare();
    expect(stored.share).toBe("false");
    expect(setSharing).not.toHaveBeenCalled();
  });

  it("does nothing when nobody is there", () => {
    tutorsConnectService.toggleShare();
    expect(stored.share).toBeUndefined();
    expect(seams.stopPresenceListener).not.toHaveBeenCalled();
    expect(setSharing).not.toHaveBeenCalled();
  });

  it("logs a record that could not be written and carries on", async () => {
    signedIn("true");
    setSharing.mockRejectedValueOnce(new Error("store down"));
    tutorsConnectService.toggleShare();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(seams.logError).toHaveBeenCalledWith("Failed to update online status:", expect.objectContaining({ message: "store down" }));
    expect(seams.tutorsId.value?.share).toBe("false");
  });
});

describe("reconnect in the browser", () => {
  const user = { login: "alice", name: "Alice" } as never;

  it("returns to the course the learner signed in from, once", async () => {
    stored.loginCourse = "cs101";
    await tutorsConnectService.reconnect(user);
    expect(seams.goto).toHaveBeenCalledWith("/course/cs101");
    expect(stored.loginCourse).toBeUndefined();

    await tutorsConnectService.reconnect(user);
    expect(seams.goto).toHaveBeenCalledTimes(1);
  });

  it("starts the course's roster for a learner who shares, and not for one who does not", async () => {
    await tutorsConnectService.reconnect(user);
    expect(stored.share).toBe(true);
    expect(seams.startCourseRoster).not.toHaveBeenCalled();

    stored.share = "true";
    await tutorsConnectService.reconnect(user);
    expect(seams.startCourseRoster).toHaveBeenCalledWith("cs101");

    seams.startCourseRoster.mockClear();
    stored.share = "false";
    await tutorsConnectService.reconnect(user);
    expect(seams.tutorsId.value?.share).toBe("false");
    expect(seams.startCourseRoster).not.toHaveBeenCalled();

    stored.share = "true";
    seams.currentCourse.value = null;
    await tutorsConnectService.reconnect(user);
    expect(seams.startCourseRoster).not.toHaveBeenCalled();
  });
});

describe("updateSentiment", () => {
  it("stores the choice in the browser", async () => {
    signedIn("true");
    await tutorsConnectService.updateSentiment("happy");
    expect(stored.sentiment).toBe("happy");
    expect(seams.tutorsId.value?.sentiment).toBe("happy");
  });
});
