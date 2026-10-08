/**
 * @tutors/tutors-types: the shared vocabulary every Tutors package and app can import.
 *
 * This package has no runtime dependencies and imports nothing outside itself (Rule 0130), so a
 * theme, a UI primitive, a server route, the JSR CLI or a standalone service can all use it
 * without pulling in Svelte, Supabase or markdown-it.
 *
 * Nothing imports it yet. guides/SHARED-TYPES.md says how existing code moves
 * onto it, one package at a time. Identity types (users, sessions, sign-in providers) are left to
 * the identity port proposed in issue #416.
 */
export * from "./learning-objects.ts";
export * from "./learner.ts";
export * from "./events.ts";
export * from "./rows.ts";
export * from "./ports.ts";
export * from "./tutors-json.ts";
