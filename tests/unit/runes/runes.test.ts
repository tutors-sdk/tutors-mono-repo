import "../../bdd/support/svelte-runes-shim.ts";
import { describe, expect, it, vi } from "vitest";
import {
  adobeLoaded,
  animationDelay,
  contentLocks,
  courseProtocol,
  currentCourse,
  currentLabStepIndex,
  currentLo,
  currentNotebookCellIndex,
  isEducator,
  locksLoaded,
  rune,
  tutorsId
} from "../../../packages/svelte/runes/src/index.svelte.ts";
import type { Course, Lo } from "../../../packages/jsr/model/src/tutors.ts";

describe("@tutors/runes", () => {
  it("a rune holds its initial value until it is set", () => {
    const count = rune(1);
    expect(count.value).toBe(1);
    count.value = 2;
    expect(count.value).toBe(2);
  });

  // Each shared value is created on first use (no Svelte state during SSR module load), so the
  // first read must give its default and a write before any read must stick.
  it.each([
    ["currentLabStepIndex", currentLabStepIndex, 0, 3],
    ["currentNotebookCellIndex", currentNotebookCellIndex, 0, 4],
    ["adobeLoaded", adobeLoaded, false, true],
    ["animationDelay", animationDelay, 200, 50],
    ["courseProtocol", courseProtocol, "https://", "http://"]
  ] as const)("%s starts at its default and keeps what is set", (_name, shared, initial, next) => {
    const value = shared as { value: unknown };
    expect(value.value).toBe(initial);
    value.value = next;
    expect(value.value).toBe(next);
  });

  it("currentLo and currentCourse start empty and keep what is set", () => {
    expect(currentLo.value).toBeNull();
    expect(currentCourse.value).toBeNull();
    const lo = { id: "lab-1" } as Lo;
    const course = { courseId: "course-1" } as Course;
    currentLo.value = lo;
    currentCourse.value = course;
    expect(currentLo.value).toBe(lo);
    expect(currentCourse.value).toBe(course);
  });

  it("the first write creates the value without a read before it", async () => {
    // A fresh module instance: its lazy values have never been read.
    vi.resetModules();
    const fresh = await import("../../../packages/svelte/runes/src/index.svelte.ts");
    fresh.currentLabStepIndex.value = 5;
    fresh.currentNotebookCellIndex.value = 6;
    fresh.adobeLoaded.value = true;
    fresh.animationDelay.value = 7;
    fresh.courseProtocol.value = "http://";
    fresh.currentLo.value = { id: "lab-2" } as Lo;
    fresh.currentCourse.value = { courseId: "course-2" } as Course;
    expect(fresh.currentLo.value?.id).toBe("lab-2");
    expect(fresh.currentCourse.value?.courseId).toBe("course-2");
    expect([
      fresh.currentLabStepIndex.value,
      fresh.currentNotebookCellIndex.value,
      fresh.adobeLoaded.value,
      fresh.animationDelay.value,
      fresh.courseProtocol.value
    ]).toEqual([5, 6, true, 7, "http://"]);
  });

  it("access state starts as a signed-out student with no locks loaded", () => {
    expect(tutorsId.value).toBeNull();
    expect(isEducator.value).toBe(false);
    expect(locksLoaded.value).toBe(false);
    expect(contentLocks.value).toEqual(new Map());
  });
});
