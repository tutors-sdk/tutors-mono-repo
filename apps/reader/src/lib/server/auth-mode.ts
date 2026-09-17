/**
 * Whether the reader runs Auth.js for this deployment.
 *
 * - `enabled`: normal sign-in with GitHub.
 * - `anonymous`: `PUBLIC_ANON_MODE=TRUE` turns authentication off entirely.
 * - `unconfigured`: no `PRIVATE_AUTH_SECRET`. Auth.js would throw `MissingSecret`
 *   from the root layout on every request, so the reader serves courses
 *   anonymously instead and logs the misconfiguration once at startup.
 */
export type AuthMode = "enabled" | "anonymous" | "unconfigured";

export function authMode(env: { PUBLIC_ANON_MODE?: string; PRIVATE_AUTH_SECRET?: string }): AuthMode {
  if (env.PUBLIC_ANON_MODE?.trim().toUpperCase() === "TRUE") return "anonymous";
  if (!env.PRIVATE_AUTH_SECRET?.trim()) return "unconfigured";
  return "enabled";
}
