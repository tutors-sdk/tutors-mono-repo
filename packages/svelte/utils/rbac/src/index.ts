/**
 * Public entry point of @tutors/rbac: roles and permissions, the content lock store, and the reader's
 * rbacService, which decides educator status and which learning objects are locked.
 */
export type { Role, Permission, ContentLock } from "./types.ts";
export { roleHasPermission, getPermissionsForRole } from "./permissions.ts";
export { getLocksForCourse, upsertLock } from "./lock-store.ts";
export { rbacService, isLoRouteLocked, SHOW_LOCKED_KEY, type LockChangeResult } from "./rbac-service.svelte.ts";
