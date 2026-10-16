/**
 * Who may read and send feedback in a course, from the course's published tutors.json: its
 * `enrollment.educators` teach it, and a private course (authLevel 1 or more with a whitelist)
 * admits only its whitelist and its educators, as the reader's pages do (`checkWhiteList`).
 */

export type Enrollment = { educators?: string[]; whitelist?: string[] };
export type CourseAccess = { authLevel: number; enrollment: Enrollment | null };

/** Reads one URL; the reader's server passes SvelteKit's fetch. */
export type FetchLike = (url: string) => Promise<{ ok: boolean; text(): Promise<string> }>;

/**
 * Where the reader's server reads a course id's tutors.json, or null for a course it will not
 * fetch. Only a course on Netlify (`<id>` or `<id>.netlify.app`) is read, so a crafted course id
 * cannot point the server at another host; feedback is unavailable on any other course.
 */
export function courseJsonUrl(courseId: string): string | null {
  const id = courseId
    .trim()
    .toLowerCase()
    .replace(/\.netlify\.app$/, "");
  return /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id) ? `https://${id}.netlify.app/tutors.json` : null;
}

export function educatorsOf(access: CourseAccess): string[] {
  const educators = access.enrollment?.educators;
  return Array.isArray(educators) ? educators.filter((e) => typeof e === "string") : [];
}

/** True when `login` teaches the course. A course with no educators list has no educators. */
export function teaches(access: CourseAccess, login: string): boolean {
  return educatorsOf(access).includes(login);
}

/** True when the course admits `login` to its pages: any course without a whitelist, or a private course's whitelist and educators. */
export function admits(access: CourseAccess, login: string): boolean {
  const whitelist = access.enrollment?.whitelist;
  if (access.authLevel < 1 || !Array.isArray(whitelist) || whitelist.length === 0) return true;
  return whitelist.includes(login) || teaches(access, login);
}

/** The most logins kept from one list of a course's enrollment: a class, not a directory. */
export const MAX_ENROLLMENT_LOGINS = 5000;
/** The most courses whose access rules are remembered at once; the oldest read is forgotten first. */
export const MAX_CACHED_COURSES = 500;

const logins = (value: unknown): string[] | undefined =>
  Array.isArray(value) ? value.filter((e): e is string => typeof e === "string" && e.length <= 100).slice(0, MAX_ENROLLMENT_LOGINS) : undefined;

/**
 * A course's access rules from its published tutors.json, cached for `cacheMs`; null when the
 * course cannot be read, which is cached too, so a missing course is not fetched on every request.
 * Only the educators and whitelist are kept, each list capped, and at most `maxCourses` courses
 * are remembered, so course ids a client makes up cannot grow the server's memory without limit.
 */
export function courseAccessReader({
  cacheMs = 5 * 60 * 1000,
  nowMs = () => Date.now(),
  maxCourses = MAX_CACHED_COURSES
}: { cacheMs?: number; nowMs?: () => number; maxCourses?: number } = {}) {
  const cache = new Map<string, { access: CourseAccess | null; at: number }>();
  return async (courseId: string, fetchFn: FetchLike): Promise<CourseAccess | null> => {
    const cached = cache.get(courseId);
    if (cached && nowMs() - cached.at < cacheMs) return cached.access;
    let access: CourseAccess | null = null;
    const url = courseJsonUrl(courseId);
    if (url) {
      try {
        const response = await fetchFn(url);
        if (response.ok) {
          const course = JSON.parse(await response.text()) as { authLevel?: unknown; enrollment?: Record<string, unknown> } | null;
          const listed = course?.enrollment && typeof course.enrollment === "object" ? course.enrollment : null;
          const enrollment: Enrollment | null = listed ? { educators: logins(listed.educators), whitelist: logins(listed.whitelist) } : null;
          access = { authLevel: typeof course?.authLevel === "number" ? course.authLevel : 0, enrollment };
        }
      } catch {
        access = null;
      }
    }
    // Re-inserted, so the map's order is oldest read first.
    cache.delete(courseId);
    cache.set(courseId, { access, at: nowMs() });
    while (cache.size > maxCourses) cache.delete(cache.keys().next().value!);
    return access;
  };
}
