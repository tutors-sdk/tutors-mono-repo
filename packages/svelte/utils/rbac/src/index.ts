export type { Role, Permission, ContentLock } from "./types.ts";
export { roleHasPermission, getPermissionsForRole } from "./permissions.ts";
export { getLocksForCourse, upsertLock, removeLock } from "./lock-store.ts";
export { rbacService } from "./rbac-service.svelte.ts";
