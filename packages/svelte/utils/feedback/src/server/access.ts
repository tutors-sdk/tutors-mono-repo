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

/**
 * A course's access rules from its published tutors.json, cached for `cacheMs`; null when the
 * course cannot be read, which is cached too, so a missing course is not fetched on every request.
 */
export function courseAccessReader({ cacheMs = 5 * 60 * 1000, nowMs = () => Date.now() }: { cacheMs?: number; nowMs?: () => number } = {}) {
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
          const course = JSON.parse(await response.text()) as { authLevel?: unknown; enrollment?: unknown } | null;
          const enrollment = course?.enrollment && typeof course.enrollment === "object" ? (course.enrollment as Enrollment) : null;
          access = { authLevel: typeof course?.authLevel === "number" ? course.authLevel : 0, enrollment };
        }
      } catch {
        access = null;
      }
    }
    cache.set(courseId, { access, at: nowMs() });
    return access;
  };
}
