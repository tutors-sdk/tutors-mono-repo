export type Role = "student" | "educator";

export type Permission = "broadcast" | "quiz:manage" | "analytics:view" | "content:lock";

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

/** The enrolment a course declares: who teaches it and, for a private course, who may read it. */
export type Enrolment = { educators?: string[]; whitelist?: string[] };

/** True when `login` is one of the course's educators. */
export function isEducatorOf(login: string | null | undefined, enrolment: Enrolment | undefined): boolean {
  if (!login) return false;
  return enrolment?.educators?.includes(login) ?? false;
}

/** The role `login` has in a course: educator when enrolled as one, otherwise student. */
export function roleFor(login: string | null | undefined, enrolment: Enrolment | undefined): Role {
  return isEducatorOf(login, enrolment) ? "educator" : "student";
}
