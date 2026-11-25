/**
 * Who may do what in a course. This is the whole authorisation policy: a pure decision over three
 * facts the caller already holds (who is asking, what the course publishes about itself, and who
 * administers this deployment). Reading those facts is the application's job (createAuthorization
 * and the CourseFactsSource port); enforcing the answer is the route's.
 */
import type { Actor } from "./actor.ts";
import { listsLogin } from "./login.ts";
import { roleHasPermission, type Permission, type Role } from "./roles.ts";

/** What a course publishes about itself that access decisions and the catalogue need. */
export interface CourseFacts {
  readonly courseId: string;
  readonly title: string | null;
  /** The logins enrollment.yaml lists under `educators`. */
  readonly educators: readonly string[];
  readonly isPrivate: boolean;
  readonly credits: string | null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean) : [];
}

/** The facts in a published tutors.json. Anything missing or of the wrong type reads as absent, never as a grant. */
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

/** Whoever is asking, as far as policy cares: the verified login and nothing else. */
export type Asker = Pick<Actor, "login">;

/** What an action is about. Courses are the only resource so far. */
export type Resource = { readonly kind: "course"; readonly courseId: string };

/**
 * The asker's role in a course: educator when the course lists them, or when this deployment's
 * administrators do; otherwise student. Nobody signed in is a student, and so is anyone asking
 * about a course that does not exist.
 */
export function roleInCourse(asker: Asker | null | undefined, facts: Pick<CourseFacts, "educators"> | null | undefined, admins: readonly string[] = []): Role {
  if (!asker?.login) return "student";
  if (listsLogin(admins, asker.login)) return "educator";
  return listsLogin(facts?.educators, asker.login) ? "educator" : "student";
}

/** Whether the asker may perform the action in the course. Nobody signed in may do nothing. */
export function permits(asker: Asker | null | undefined, action: Permission, facts: Pick<CourseFacts, "educators"> | null | undefined, admins: readonly string[] = []): boolean {
  if (!asker?.login) return false;
  return roleHasPermission(roleInCourse(asker, facts, admins), action);
}
