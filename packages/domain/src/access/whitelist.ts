import type { Enrolment } from "./roles.ts";
import { isEducatorOf } from "./roles.ts";

/** A course's access rules, as far as the whitelist is concerned. */
export type CourseAccess = { authLevel?: number; enrollment?: Enrolment };

/**
 * Whether `login` may read a course that requires sign-in and has a whitelist. A course with no
 * auth level, or no whitelist, admits everyone; an educator is always admitted; a visitor without
 * a login, or one not on the list, is turned away.
 */
export function whitelistAdmits(course: CourseAccess | null | undefined, login: string | null | undefined): boolean {
  if (!course?.authLevel || course.authLevel < 1) return true;
  const enrollment = course.enrollment;
  if (!enrollment?.whitelist || enrollment.whitelist.length === 0) return true;
  if (!login) return false;
  return isEducatorOf(login, enrollment) || enrollment.whitelist.includes(login);
}

/** True when a course requires a signed-in reader and nobody is signed in. */
export function requiresSignIn(course: CourseAccess | null | undefined, login: string | null | undefined): boolean {
  return (course?.authLevel ?? 0) > 0 && !login;
}
