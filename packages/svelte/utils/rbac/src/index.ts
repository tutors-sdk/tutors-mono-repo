export type { Role, Permission, RoleAssignment, ContentLock } from "./types.ts";
export { roleHasPermission, getPermissionsForRole } from "./permissions.ts";
export { getUserRole, assignRole, revokeRole, listRolesForCourse } from "./role-store.ts";
export { getLocksForCourse, upsertLock, removeLock } from "./lock-store.ts";
export { rbacService } from "./rbac-service.svelte.ts";
