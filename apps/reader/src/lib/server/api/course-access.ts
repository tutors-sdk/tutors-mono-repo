export interface CourseFacts {
  courseId: string;
  title: string | null;
  educators: string[];
  isPrivate: boolean;
  credits: string | null;
}

export interface CourseAccessOptions {
  fetch: typeof fetch;
  allowedHosts?: string[];
  admins?: string[];
  ttlMs?: number;
  now?: () => number;
}

export function listFromEnv(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

export function courseJsonUrl(courseId: string, allowedHosts: string[] = []): string | null {
  const id = courseId.trim().toLowerCase();
  if (!id || id.includes("/") || id.includes(":") || id.includes("..")) return null;
  if (!id.includes(".")) return `https://${id}.netlify.app/tutors.json`;
  if (id.endsWith(".netlify.app") || allowedHosts.map((h) => h.toLowerCase()).includes(id)) {
    return `https://${id}/tutors.json`;
  }
  return null;
}

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

  function course(courseId: string): Promise<CourseFacts | null> {
    const hit = cache.get(courseId);
    if (hit && now() - hit.at < ttlMs) return hit.facts;
    const facts = load(courseId);
    cache.set(courseId, { at: now(), facts });
    facts.then((f) => {
      if (!f) cache.delete(courseId);
    });
    if (cache.size > 2000) cache.delete(cache.keys().next().value!);
    return facts;
  }

  async function isEducator(login: string, courseId: string): Promise<boolean> {
    if (!login) return false;
    if (admins.has(login)) return true;
    const facts = await course(courseId);
    return facts?.educators.includes(login) ?? false;
  }

  return { course, isEducator };
}

export type CourseAccess = ReturnType<typeof createCourseAccess>;
