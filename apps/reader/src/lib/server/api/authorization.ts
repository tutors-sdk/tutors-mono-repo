/**
 * The reader's authorisation, composed: the application's use case (createAuthorization: one
 * question, `can(asker, action, resource)`, answered from a course's published facts) over the HTTP
 * adapter that reads those facts from the course's host. The policy itself is the domain's
 * (@tutors/domain/access: roles, permissions, whose login counts, which hosts are trusted); nothing
 * here decides anything.
 */
import { createAuthorization as createCourseAuthorization, type Authorization } from "@tutors/application";
import { publishedCourseFacts } from "@tutors/course-http";

export { AuthorizationUnavailableError, type Authorization } from "@tutors/application";
export type { Asker as Actor, CourseFacts, Resource } from "@tutors/domain/access";

export interface AuthorizationOptions {
  fetch: typeof fetch;
  /** Extra host names allowed to serve tutors.json, from PRIVATE_COURSE_HOSTS. */
  allowedHosts?: string[];
  /** Logins treated as educators of every course, from PRIVATE_TUTORS_ADMINS. */
  admins?: string[];
  /** How long a course read is trusted without asking its host again. */
  ttlMs?: number;
  /** How old a copy may be and still decide while the host is unreachable. */
  staleMs?: number;
  now?: () => number;
}

/** A comma- or space-separated environment value as a list. */
export function listFromEnv(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

export function createAuthorization(options: AuthorizationOptions): Authorization {
  return createCourseAuthorization({
    source: publishedCourseFacts({ fetch: options.fetch, allowedHosts: options.allowedHosts }),
    admins: options.admins,
    ttlMs: options.ttlMs,
    staleMs: options.staleMs,
    now: options.now
  });
}
