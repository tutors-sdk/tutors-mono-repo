/**
 * Convenience barrel. Prefer the subpath entries in app code:
 *
 * - `@tutors/hooks/server` from `hooks.server.ts`
 * - `@tutors/hooks/client` from `hooks.client.ts`
 * - `@tutors/hooks/mode`   from either
 *
 * Importing this barrel from server code would pull the client module (and its
 * Supabase error transport) into the server bundle.
 */
export type { HooksMode } from "./mode.ts";
export { HOOKS_MODE_ENV, DEFAULT_HOOKS_MODE, resolveHooksMode, usesSharedHooks } from "./mode.ts";
export { SECURITY_HEADERS, securityHeaders, createServerErrorHandler } from "./server.ts";
export { createClientErrorHandler, initClientErrorHandling } from "./client.ts";
