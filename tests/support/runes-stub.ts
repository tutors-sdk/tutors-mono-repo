/**
 * Plain (non-reactive) stand-in for @tutors/runes.
 *
 * The real package uses Svelte 5 `$state`, which the root vitest config does
 * not compile. Unit tests only need the `.value` get/set contract, so this
 * mirrors the package's export list with ordinary objects.
 */
import type { Course, Lo, TutorsId } from "@tutors/tutors-model-lib";

export const rune = <T>(initialValue: T) => {
  let current = initialValue;
  return {
    get value() {
      return current;
    },
    set value(v: T) {
      current = v;
    }
  };
};

export const currentLabStepIndex = rune(0);
export const adobeLoaded = rune(false);
export const animationDelay = rune(200);
export const currentLo = rune<Lo | null>(null);
export const currentCourse = rune<Course | null>(null);
export const tutorsId = rune<TutorsId | null>(null);
export const courseProtocol = rune("https://");
export const isEducator = rune(false);
export const contentLocks = rune<Map<string, boolean>>(new Map());
export const locksLoaded = rune(false);
