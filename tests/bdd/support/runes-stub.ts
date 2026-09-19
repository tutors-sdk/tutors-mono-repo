/**
 * Stand-in for `@tutors/runes` in executable features.
 *
 * The real `rune()` wraps a value in Svelte's `$state`, which only exists once
 * the Svelte compiler has processed the file; the root Vitest config has no
 * Svelte compiler. A rune is read and written through `.value` and nothing
 * else, so a plain box lets product modules that keep their state in runes
 * (i18n, the theme service) load and run unchanged. Only reactivity is lost,
 * and no step asserts on reactivity.
 *
 * Use: `vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../support/runes-stub.ts"));`
 * (the path, not `@tutors/runes`: the bare name does not resolve from tests/, so the mock would not match).
 */
export const rune = <T>(initialValue: T): { value: T } => ({ value: initialValue });

// The shared runes the real module also exports, with the same initial values.
export const currentLabStepIndex = rune(0);
export const adobeLoaded = rune(false);
export const animationDelay = rune(200);
export const currentLo = rune<unknown>(null);
export const currentCourse = rune<unknown>(null);
export const tutorsId = rune<unknown>(null);
export const courseProtocol = rune("https://");
export const isEducator = rune(false);
export const contentLocks = rune(new Map<string, boolean>());
export const locksLoaded = rune(false);
