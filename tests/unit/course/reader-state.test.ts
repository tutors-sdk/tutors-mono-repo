/**
 * The reader's shared state in the svelte-state adapter: each piece is created on first use (so
 * importing the module during server rendering creates no rune) and then reads back what was set.
 */
import "../../bdd/support/svelte-runes-shim.ts";
import { describe, expect, it } from "vitest";
import {
  adobeLoaded,
  animationDelay,
  courseProtocol,
  currentCourse,
  currentLabStepIndex,
  currentLo,
  currentNotebookCellIndex
} from "../../../packages/adapters/driving/svelte-state/src/index.svelte.ts";
import { anonymousAdapters } from "../../../packages/adapters/driving/svelte-state/src/adapters.ts";

describe("reader state", () => {
  it("starts from its defaults", () => {
    expect(currentLabStepIndex.value).toBe(0);
    expect(currentNotebookCellIndex.value).toBe(0);
    expect(adobeLoaded.value).toBe(false);
    expect(animationDelay.value).toBe(200);
    expect(courseProtocol.value).toBe("https://");
    expect(currentLo.value).toBeNull();
    expect(currentCourse.value).toBeNull();
  });

  it("reads back what the pages set", () => {
    currentLabStepIndex.value = 3;
    currentNotebookCellIndex.value = 2;
    adobeLoaded.value = true;
    animationDelay.value = 0;
    courseProtocol.value = "http://";
    expect(currentLabStepIndex.value).toBe(3);
    expect(currentNotebookCellIndex.value).toBe(2);
    expect(adobeLoaded.value).toBe(true);
    expect(animationDelay.value).toBe(0);
    expect(courseProtocol.value).toBe("http://");
    courseProtocol.value = "https://";
  });

  it("the anonymous adapters tell the time from the system clock", () => {
    const { clock } = anonymousAdapters();
    const before = Date.now();
    expect(clock.nowMs()).toBeGreaterThanOrEqual(before);
    expect(clock.now().getTime()).toBeGreaterThanOrEqual(before);
  });
});
