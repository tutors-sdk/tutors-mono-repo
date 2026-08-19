import type { Role, Permission } from "./types.ts";

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  student: [],
  educator: ["broadcast", "quiz:manage", "analytics:view", "content:lock"]
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function getPermissionsForRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}
