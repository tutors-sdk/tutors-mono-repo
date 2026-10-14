export type { Role, Permission, ContentLock } from "@tutors/domain/access";
export { roleHasPermission, getPermissionsForRole } from "@tutors/domain/access";
export { rbacService, isLoRouteLocked, SHOW_LOCKED_KEY } from "./rbac-service.svelte.ts";
