import { requiresSignIn, whitelistAdmits, type CourseAccess } from "@tutors/domain/access";

export type Admission = "admit" | "sign-in" | "deny";

/**
 * Whether a visitor may read a course: admitted, sent to sign in (the course needs a login and
 * they have none), or turned away (signed in but not on the whitelist).
 */
export function courseAdmission(course: CourseAccess | null | undefined, login: string | null | undefined): Admission {
  if (requiresSignIn(course, login)) return "sign-in";
  return whitelistAdmits(course, login) ? "admit" : "deny";
}
