import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("../../../packages/svelte/utils/rbac/src/lock-store.ts", () => ({
  getLocksForCourse: vi.fn(),
  upsertLock: vi.fn(),
  removeLock: vi.fn(),
}));

vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => {
  const rune = <T>(initial: T) => ({ value: initial });
  return {
    rune,
    contentLocks: rune(new Map<string, boolean>()),
    isEducator: rune(false),
    locksLoaded: rune(false),
    tutorsId: rune(null),
    currentCourse: rune(null),
  };
});

import { contentLocks, currentCourse, isEducator, locksLoaded } from "../../../packages/svelte/runes/src/index.svelte.ts";
import { getLocksForCourse } from "../../../packages/svelte/utils/rbac/src/lock-store.ts";
import { isLoRouteLocked, rbacService, SHOW_LOCKED_KEY } from "../../../packages/svelte/utils/rbac/src/rbac-service.svelte.ts";
import type { Lo } from "@tutors/tutors-model-lib";

describe("isLoRouteLocked", () => {
  it("returns true for an exact route match", () => {
    const locks = new Map([["/course/cs101/topic-01", true]]);
    expect(isLoRouteLocked("/course/cs101/topic-01", locks)).toBe(true);
  });

  it("returns true for a child route under a locked topic", () => {
    const locks = new Map([["/course/cs101/topic-01", true]]);
    expect(isLoRouteLocked("/course/cs101/topic-01/lab-03", locks)).toBe(true);
  });

  it("returns true for a wall LO under a locked topic with a different type prefix", () => {
    const locks = new Map([["/topic/cs101/week-01", true]]);
    expect(isLoRouteLocked("/lab/cs101/week-01/lab-03", locks)).toBe(true);
    expect(isLoRouteLocked("/talk/cs101/week-01/slides", locks)).toBe(true);
  });

  it("does not match a similar but distinct topic path", () => {
    const locks = new Map([["/topic/cs101/week-01", true]]);
    expect(isLoRouteLocked("/lab/cs101/week-010/lab-03", locks)).toBe(false);
    expect(isLoRouteLocked("/topic/cs101/week-010", locks)).toBe(false);
  });

  it("does not treat a short lock path as matching the whole course", () => {
    const locks = new Map([["/topic/cs101", true]]);
    expect(isLoRouteLocked("/topic/cs101/week-02", locks)).toBe(false);
    expect(isLoRouteLocked("/lab/cs101/week-02/lab-03", locks)).toBe(false);
  });

  it("returns false when the route is not locked", () => {
    const locks = new Map([["/course/cs101/topic-01", true]]);
    expect(isLoRouteLocked("/course/cs101/topic-02/lab-03", locks)).toBe(false);
  });

  it("returns true when one of multiple locks matches", () => {
    const locks = new Map([
      ["/course/cs101/topic-01", true],
      ["/course/cs101/unit-02", true],
    ]);
    expect(isLoRouteLocked("/course/cs101/unit-02/note-01", locks)).toBe(true);
  });

  it("returns false when a lock entry exists but is not locked", () => {
    const locks = new Map([["/course/cs101/topic-01", false]]);
    expect(isLoRouteLocked("/course/cs101/topic-01/lab-03", locks)).toBe(false);
  });

  it("returns false for an empty locks map", () => {
    expect(isLoRouteLocked("/course/cs101/topic-01", new Map())).toBe(false);
  });
});

describe("rbacService.isLoLocked", () => {
  const course = { route: "/course/cs101", type: "course" } as Lo;

  const topic = {
    route: "/topic/cs101/week-01",
    type: "topic",
    parentLo: course,
  } as Lo;

  const lab = {
    route: "/lab/cs101/week-01/lab-03",
    type: "lab",
    parentLo: topic,
  } as Lo;

  const otherTopic = {
    route: "/topic/cs101/week-02",
    type: "topic",
    parentLo: course,
  } as Lo;

  it("returns true when the lo or a parent topic is locked", () => {
    contentLocks.value = new Map([["/topic/cs101/week-01", true]]);
    expect(rbacService.isLoLocked(lab)).toBe(true);
    expect(rbacService.isLoLocked(topic)).toBe(true);
  });

  it("returns false for siblings of a locked topic", () => {
    contentLocks.value = new Map([["/topic/cs101/week-01", true]]);
    expect(rbacService.isLoLocked(otherTopic)).toBe(false);
  });

  it("returns false when no locks apply", () => {
    contentLocks.value = new Map();
    expect(rbacService.isLoLocked(lab)).toBe(false);
    expect(rbacService.isLoLocked(otherTopic)).toBe(false);
  });

  it("returns true for a panelvideo under a locked topic", () => {
    const video = {
      route: "/video/cs101/week-01/intro",
      type: "panelvideo",
      parentLo: topic,
    } as Lo;
    contentLocks.value = new Map([["/topic/cs101/week-01", true]]);
    expect(rbacService.isLoLocked(video)).toBe(true);
  });

  it("does not hide all content when the course route is locked", () => {
    contentLocks.value = new Map([["/course/cs101", true]]);
    expect(rbacService.isLoLocked(otherTopic)).toBe(false);
    expect(rbacService.isLoLocked(topic)).toBe(false);
  });

  it("does not treat the course home LO as locked", () => {
    contentLocks.value = new Map([["/course/cs101", true]]);
    expect(rbacService.isLoLocked({ route: "/course/cs101", type: "course" } as Lo)).toBe(false);
  });
});

describe("rbacService.isLoVisibleToStudent", () => {
  const lo = { route: "/topic/cs101/week-01", hide: false } as Lo;

  beforeEach(() => {
    contentLocks.value = new Map();
    locksLoaded.value = true;
    currentCourse.value = { hasEnrollment: true } as any;
  });

  it("returns false for hidden los", () => {
    expect(rbacService.isLoVisibleToStudent({ ...lo, hide: true })).toBe(false);
  });

  it("returns true when course has no enrollment", () => {
    currentCourse.value = { hasEnrollment: false } as any;
    contentLocks.value = new Map([["/topic/cs101/week-01", true]]);
    expect(rbacService.isLoVisibleToStudent(lo)).toBe(true);
  });

  it("returns false while locks are loading for enrolled students", () => {
    locksLoaded.value = false;
    expect(rbacService.isLoVisibleToStudent(lo)).toBe(false);
  });

  it("returns false for locked los on enrolled courses", () => {
    contentLocks.value = new Map([["/topic/cs101/week-01", true]]);
    expect(rbacService.isLoVisibleToStudent(lo)).toBe(false);
  });

  it("returns true for unlocked los on enrolled courses", () => {
    expect(rbacService.isLoVisibleToStudent(lo)).toBe(true);
  });
});

describe("rbacService.loadContentLocks", () => {
  beforeEach(() => {
    vi.mocked(getLocksForCourse).mockReset();
    contentLocks.value = new Map();
    locksLoaded.value = false;
  });

  it("marks locks as loaded once the store responds", async () => {
    vi.mocked(getLocksForCourse).mockResolvedValue([
      { lo_route: "/topic/cs101/week-01", locked: true } as any,
    ]);
    await rbacService.loadContentLocks("cs101");
    expect(locksLoaded.value).toBe(true);
    expect(contentLocks.value.get("/topic/cs101/week-01")).toBe(true);
  });

  it("resolves rather than rejecting when the lock store fails", async () => {
    vi.mocked(getLocksForCourse).mockRejectedValue(new Error("network down"));
    await expect(rbacService.loadContentLocks("cs999")).resolves.toBeUndefined();
    expect(locksLoaded.value).toBe(true);
    expect(contentLocks.value.size).toBe(0);
  });

  it("marks locks as loaded when there is no course id", async () => {
    await rbacService.loadContentLocks("");
    expect(locksLoaded.value).toBe(true);
  });
});

describe("rbacService.clear", () => {
  it("leaves lock state resolved, not pending", () => {
    locksLoaded.value = false;
    contentLocks.value = new Map([["/topic/cs101/week-01", true]]);
    rbacService.clear();
    expect(locksLoaded.value).toBe(true);
    expect(contentLocks.value.size).toBe(0);
  });
});

describe("show locked content to students (the lecturer's setting)", () => {
  const topic = { type: "topic", route: "/topic/cs101/topic-01", hide: false } as Lo;

  beforeEach(() => {
    isEducator.value = false;
    contentLocks.value = new Map();
  });

  it("is a setting, never a lock: it locks no route and does not count as an active lock", () => {
    contentLocks.value = new Map([[SHOW_LOCKED_KEY, true]]);
    expect(isLoRouteLocked(topic.route, contentLocks.value)).toBe(false);
    expect(rbacService.hasActiveLocks()).toBe(false);
    expect(rbacService.showLockedToStudents()).toBe(true);
  });

  it("hides a locked card from a student by default, and shows it when the lecturer turns the setting on", () => {
    contentLocks.value = new Map([[topic.route, true]]);
    expect(rbacService.isLoCardVisible(topic)).toBe(false);
    contentLocks.value = new Map([[topic.route, true], [SHOW_LOCKED_KEY, true]]);
    expect(rbacService.isLoCardVisible(topic)).toBe(true);
  });

  it("always shows a locked card to a lecturer, and never a hidden one to anyone", () => {
    contentLocks.value = new Map([[topic.route, true]]);
    isEducator.value = true;
    expect(rbacService.isLoCardVisible(topic)).toBe(true);
    expect(rbacService.isLoCardVisible({ ...topic, hide: true } as Lo)).toBe(false);
  });
});

describe("route normalisation", () => {
  it("ignores any number of trailing slashes on either side, and a long run of them stays fast", () => {
    const locks = new Map([["/topic/cs101/topic-01///", true]]);
    expect(isLoRouteLocked("/topic/cs101/topic-01", locks)).toBe(true);
    expect(isLoRouteLocked("/lab/cs101/topic-01/book-a//", locks)).toBe(true);
    const start = performance.now();
    expect(isLoRouteLocked(`/topic/cs101${"/".repeat(50_000)}x`, locks)).toBe(false);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
