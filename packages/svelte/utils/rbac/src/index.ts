export type { Role, Permission, ContentLock } from "./types.ts";
export { roleHasPermission, getPermissionsForRole } from "./permissions.ts";
export { getLocksForCourse, upsertLock } from "./lock-store.ts";
export { rbacService, isLoRouteLocked, SHOW_LOCKED_KEY, type LockChangeResult } from "./rbac-service.svelte.ts";
