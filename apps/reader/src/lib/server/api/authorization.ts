import { roleHasPermission } from "@tutors/rbac/permissions";
import type { Permission, Role } from "@tutors/rbac/types";

export interface CourseFacts {
  courseId: string;
  title: string | null;
  educators: string[];
  isPrivate: boolean;
  credits: string | null;
  /** The pages the reader opens for the course, in course order (Rule 0077 counts progression against them). */
  learningObjects: PublishedLo[];
}

export interface PublishedLo {
  route: string;
  title: string;
}

/** Containers, lab steps, topic-page panels and links out: learning objects the reader does not open as a page of their own. */
const NOT_A_PAGE = new Set(["course", "topic", "unit", "side", "step", "panelnote", "paneltalk", "panelvideo", "web", "github", "archive"]);

type RawLo = { type?: unknown; route?: unknown; title?: unknown; los?: unknown };

function publishedLos(courseId: string, los: unknown, out: PublishedLo[] = []): PublishedLo[] {
  if (!Array.isArray(los)) return out;
  for (const lo of los as RawLo[]) {
    if (!lo || typeof lo !== "object") continue;
    if (typeof lo.type === "string" && typeof lo.route === "string" && !NOT_A_PAGE.has(lo.type)) {
      out.push({ route: lo.route.replaceAll("{{COURSEURL}}", courseId), title: typeof lo.title === "string" ? lo.title : "" });
    }
    // Lab steps sit beneath their lab, and a unit's or side's pages beneath it.
    if (lo.type !== "lab") publishedLos(courseId, lo.los, out);
  }
  return out;
}

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
    credits: typeof credits === "string" || typeof credits === "number" ? String(credits) : null,
    learningObjects: publishedLos(courseId, (course as { los?: unknown }).los)
  };
}

/** Someone signed in, as the Auth.js session names them. */
export interface Actor {
  login: string;
}

/** What an action is about. Courses are the only resource so far; the union grows with the message bus. */
export type Resource = { kind: "course"; courseId: string };

/**
 * The course's host could not be read (network error, timeout, 5xx, a broken tutors.json) and the
 * reader holds no copy young enough to use. Routes answer 503: "not an educator" would be a lie.
 */
export class AuthorizationUnavailableError extends Error {
  constructor(readonly courseId: string) {
    super(`Could not read the educators of ${courseId} from its host`);
    this.name = "AuthorizationUnavailableError";
  }
}

type Lookup = { kind: "found"; facts: CourseFacts } | { kind: "missing" } | { kind: "unavailable" };

/**
 * The reader's single authorization module: who may do what, decided on the server.
 *
 *   can(actor, action, resource)   the one question routes ask
 *   course(courseId)               the published facts about a course (title, educators, privacy)
 *
 * A login's role in a course comes from the course's enrollment.yaml (`educators`), read from its
 * published tutors.json, or from PRIVATE_TUTORS_ADMINS; what a role may do comes from the RBAC
 * package's permission table (packages/svelte/utils/rbac/src/permissions.ts), the same one the
 * browser uses. A course read is cached for `ttlMs` (5 minutes); while its host is unreachable the
 * last copy read within `staleMs` (an hour) is used instead (Rule 0074), and without one the
 * decision is AuthorizationUnavailableError (Rule 0073), never a silent "no".
 */
export function createAuthorization(options: AuthorizationOptions) {
  const ttlMs = options.ttlMs ?? 5 * 60_000;
  const staleMs = options.staleMs ?? 60 * 60_000;
  const now = options.now ?? (() => Date.now());
  const admins = new Set(options.admins ?? []);
  const fresh = new Map<string, { at: number; lookup: Promise<Lookup> }>();
  const lastGood = new Map<string, { at: number; facts: CourseFacts }>();

  async function load(courseId: string): Promise<Lookup> {
    let url = courseJsonUrl(courseId, options.allowedHosts);
    if (!url) return { kind: "missing" };
    try {
      for (let hop = 0; hop <= 3; hop++) {
        const response = await options.fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
        if (response.status >= 300 && response.status < 400) {
          const next = redirectTarget(url, response.headers.get("location"));
          if (!next) return { kind: "missing" };
          url = next;
          continue;
        }
        if (response.status >= 500 || response.status === 429) return { kind: "unavailable" };
        if (!response.ok) return { kind: "missing" };
        return { kind: "found", facts: courseFactsFrom(courseId, await response.json()) };
      }
      return { kind: "missing" };
    } catch {
      return { kind: "unavailable" };
    }
  }

  function lookup(courseId: string): Promise<Lookup> {
    const hit = fresh.get(courseId);
    if (hit && now() - hit.at < ttlMs) return hit.lookup;
    const at = now();
    const pending = load(courseId).then((result) => {
      if (result.kind === "found") lastGood.set(courseId, { at, facts: result.facts });
      // Only a found course is worth caching; a missing or unreachable one is asked again next time.
      else fresh.delete(courseId);
      return result;
    });
    fresh.set(courseId, { at, lookup: pending });
    if (fresh.size > 2000) fresh.delete(fresh.keys().next().value!);
    if (lastGood.size > 2000) lastGood.delete(lastGood.keys().next().value!);
    return pending;
  }

  /** The course's published facts; null when its host has no such course. Throws AuthorizationUnavailableError. */
  async function course(courseId: string): Promise<CourseFacts | null> {
    const result = await lookup(courseId);
    if (result.kind === "found") return result.facts;
    if (result.kind === "missing") return null;
    const stale = lastGood.get(courseId);
    if (stale && now() - stale.at < staleMs) return stale.facts;
    throw new AuthorizationUnavailableError(courseId);
  }

  /** The actor's role in the resource's course. */
  async function roleIn(actor: Actor | null, resource: Resource): Promise<Role> {
    if (!actor?.login) return "student";
    if (admins.has(actor.login)) return "educator";
    const facts = await course(resource.courseId);
    return facts?.educators.includes(actor.login) ? "educator" : "student";
  }

  /** Whether the actor may perform the action on the resource. Throws AuthorizationUnavailableError. */
  async function can(actor: Actor | null, action: Permission, resource: Resource): Promise<boolean> {
    if (!actor?.login) return false;
    return roleHasPermission(await roleIn(actor, resource), action);
  }

  return { can, course };
}

export type Authorization = ReturnType<typeof createAuthorization>;
