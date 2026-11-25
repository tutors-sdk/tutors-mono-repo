import type { CourseId } from "@tutors/domain/course/address";
import { permits, type Asker, type CourseFacts, type Permission, type Resource } from "@tutors/domain/access";
import type { CourseFactsLookup, CourseFactsSource } from "../ports/course-facts.ts";

export type AuthorizationDeps = {
  /** Where a course's published facts are read from. */
  source: CourseFactsSource;
  /** Logins treated as educators of every course in this deployment. */
  admins?: readonly string[];
  /** How long a course read is trusted without asking its host again. */
  ttlMs?: number;
  /** How old a copy may be and still decide while the host is unreachable. */
  staleMs?: number;
  now?: () => number;
};

/**
 * The course's host could not be read and no copy young enough to use is held. A caller answers
 * "try again shortly": "not an educator" would be a lie.
 */
export class AuthorizationUnavailableError extends Error {
  constructor(readonly courseId: CourseId) {
    super(`Could not read the educators of ${courseId} from its host`);
    this.name = "AuthorizationUnavailableError";
  }
}

const MAX_COURSES = 2000;

/**
 * The one authorisation use case: who may do what, decided on the server.
 *
 *   can(asker, action, resource)   the one question a route asks
 *   course(courseId)               the published facts about a course (title, educators, privacy)
 *
 * The decision itself is the domain's (`permits`); this use case supplies its facts. A course read
 * is trusted for `ttlMs` (5 minutes); while its host is unreachable the last copy read within
 * `staleMs` (an hour) decides instead (Rule 0074), and without one the answer is
 * AuthorizationUnavailableError (Rule 0073), never a silent "no".
 */
export function createAuthorization(deps: AuthorizationDeps) {
  const ttlMs = deps.ttlMs ?? 5 * 60_000;
  const staleMs = deps.staleMs ?? 60 * 60_000;
  const now = deps.now ?? (() => Date.now());
  const admins = deps.admins ?? [];
  const fresh = new Map<CourseId, { at: number; lookup: Promise<CourseFactsLookup> }>();
  const lastGood = new Map<CourseId, { at: number; facts: CourseFacts }>();

  function lookup(courseId: CourseId): Promise<CourseFactsLookup> {
    const hit = fresh.get(courseId);
    if (hit && now() - hit.at < ttlMs) return hit.lookup;
    const at = now();
    const pending = deps.source.read(courseId).then((result) => {
      if (result.kind === "found") lastGood.set(courseId, { at, facts: result.facts });
      // Only a found course is worth keeping; a missing or unreachable one is asked again next time.
      else fresh.delete(courseId);
      return result;
    });
    fresh.set(courseId, { at, lookup: pending });
    if (fresh.size > MAX_COURSES) fresh.delete(fresh.keys().next().value!);
    if (lastGood.size > MAX_COURSES) lastGood.delete(lastGood.keys().next().value!);
    return pending;
  }

  /** The course's published facts; null when its host has no such course. Throws AuthorizationUnavailableError. */
  async function course(courseId: CourseId): Promise<CourseFacts | null> {
    const result = await lookup(courseId);
    if (result.kind === "found") return result.facts;
    if (result.kind === "missing") return null;
    const stale = lastGood.get(courseId);
    if (stale && now() - stale.at < staleMs) return stale.facts;
    throw new AuthorizationUnavailableError(courseId);
  }

  /** Whether the asker may perform the action on the resource. Throws AuthorizationUnavailableError. */
  async function can(asker: Asker | null, action: Permission, resource: Resource): Promise<boolean> {
    if (!asker?.login) return false;
    // An administrator's answer does not wait on, or fail with, the course's host.
    if (permits(asker, action, null, admins)) return true;
    return permits(asker, action, await course(resource.courseId), admins);
  }

  return { can, course };
}

export type Authorization = ReturnType<typeof createAuthorization>;
