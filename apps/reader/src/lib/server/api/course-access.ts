/**
 * Who teaches a course, decided on the server.
 *
 * The reader's RBAC (packages/svelte/utils/rbac, guides/RBAC.md) makes a GitHub login an educator
 * of a course when the course's `enrollment.yaml` lists it under `educators`. The browser already
 * decides that for the UI; the /api routes decide it again here from the course's published
 * tutors.json, because a browser can claim anything. Platform maintainers listed in
 * PRIVATE_TUTORS_ADMINS count as educators of every course.
 *
 * Only a fixed set of hosts is ever fetched, never a URL taken from the request: a course id
 * without a dot is a Netlify site (`https://<id>.netlify.app/tutors.json`); a host name is fetched
 * only when it ends in `.netlify.app` or is listed in PRIVATE_COURSE_HOSTS.
 */

export interface CourseFacts {
  courseId: string;
  title: string | null;
  educators: string[];
  isPrivate: boolean;
  credits: string | null;
}

export interface CourseAccessOptions {
  fetch: typeof fetch;
  /** Extra host names allowed to serve tutors.json, from PRIVATE_COURSE_HOSTS. */
  allowedHosts?: string[];
  /** Logins treated as educators of every course, from PRIVATE_TUTORS_ADMINS. */
  admins?: string[];
  ttlMs?: number;
  now?: () => number;
}

/** Splits a comma- or whitespace-separated env value into its non-empty entries. */
export function listFromEnv(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

/** The tutors.json URL for a course id, or null when its host is not one the server may fetch. */
export function courseJsonUrl(courseId: string, allowedHosts: string[] = []): string | null {
  const id = courseId.trim().toLowerCase();
  if (!id || id.includes("/") || id.includes(":") || id.includes("..")) return null;
  if (!id.includes(".")) return `https://${id}.netlify.app/tutors.json`;
  if (id.endsWith(".netlify.app") || allowedHosts.map((h) => h.toLowerCase()).includes(id)) {
    return `https://${id}/tutors.json`;
  }
  return null;
}

/** Where a redirect from `from` may be followed: an https URL on a named public host, else null. */
export function redirectTarget(from: string, location: string | null): string | null {
  if (!location) return null;
  try {
    const next = new URL(location, from);
    const host = next.hostname.toLowerCase();
    const isIpLiteral = /^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[");
    if (next.protocol !== "https:" || isIpLiteral || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || !host.includes(".")) return null;
    return next.toString();
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean) : [];
}

/** The facts the server needs from a parsed tutors.json. */
export function courseFactsFrom(courseId: string, json: unknown): CourseFacts {
  const course = (json ?? {}) as {
    title?: unknown;
    properties?: { private?: unknown; credits?: unknown };
    enrollment?: { educators?: unknown };
  };
  const credits = course.properties?.credits;
  return {
    courseId,
    title: typeof course.title === "string" ? course.title : null,
    educators: stringList(course.enrollment?.educators),
    isPrivate: Number(course.properties?.private) === 1,
    credits: typeof credits === "string" || typeof credits === "number" ? String(credits) : null
  };
}

export function createCourseAccess(options: CourseAccessOptions) {
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const now = options.now ?? Date.now;
  const admins = new Set(options.admins ?? []);
  const cache = new Map<string, { at: number; facts: Promise<CourseFacts | null> }>();

  async function load(courseId: string): Promise<CourseFacts | null> {
    let url = courseJsonUrl(courseId, options.allowedHosts);
    if (!url) return null;
    try {
      // A Netlify site with a custom domain redirects to it. Follow at most three redirects by hand,
      // and only to a public https host, so a course site cannot point the server at an internal address.
      for (let hop = 0; hop <= 3; hop++) {
        const response = await options.fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
        if (response.status >= 300 && response.status < 400) {
          const next = redirectTarget(url, response.headers.get("location"));
          if (!next) return null;
          url = next;
          continue;
        }
        if (!response.ok) return null;
        return courseFactsFrom(courseId, await response.json());
      }
      return null;
    } catch {
      return null;
    }
  }

  /** The course's facts, cached for a few minutes; null when the course cannot be found. */
  function course(courseId: string): Promise<CourseFacts | null> {
    const hit = cache.get(courseId);
    if (hit && now() - hit.at < ttlMs) return hit.facts;
    const facts = load(courseId);
    cache.set(courseId, { at: now(), facts });
    // A failed lookup is not cached for the full period, so a course that was briefly unreachable recovers.
    facts.then((f) => {
      if (!f) cache.delete(courseId);
    });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    return facts;
  }

  /** Whether `login` teaches `courseId`. */
  async function isEducator(login: string, courseId: string): Promise<boolean> {
    if (!login) return false;
    if (admins.has(login)) return true;
    const facts = await course(courseId);
    return facts?.educators.includes(login) ?? false;
  }

  return { course, isEducator };
}

export type CourseAccess = ReturnType<typeof createCourseAccess>;
