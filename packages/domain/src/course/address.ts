/**
 * Where a course is served. A learner opens a course by a bare Netlify id, a host name with an
 * optional port and path, or a full http(s) URL; all of them resolve to one address, so one course
 * has one id whichever way it was opened.
 */
import type { Course } from "./types/index.ts";

declare const courseIdBrand: unique symbol;
declare const loRouteBrand: unique symbol;

/**
 * The id a course is known under everywhere: caches, analytics, locks and enrolment key on it. It
 * is a string that has passed a rule (`courseId` in @tutors/domain/input, or `courseAddress`
 * here), and the compiler keeps a login, a route or raw request text from standing in for one.
 */
export type CourseId = string & { readonly [courseIdBrand]: true };

/** A learning object's route, as `loRoute` in @tutors/domain/input accepts it. Not a course id and not a login. */
export type LoRoute = string & { readonly [loRouteBrand]: true };

/** The protocol each decorated course is served on, kept with the course rather than in shared state. */
const courseProtocols = new WeakMap<Course, string>();

/** Decorating a course records the protocol it is served on. */
export function rememberCourseProtocol(course: Course, protocol: string): void {
  courseProtocols.set(course, protocol);
}

/** The protocol `course` is served on, as resolved when it was decorated ("https://" when none was given). */
export function courseProtocolOf(course: Course): string {
  return courseProtocols.get(course) ?? "https://";
}

/** `courseUrl` has no scheme; `protocol` is the scheme to fetch and link the course with. */
export interface CourseAddress {
  /** The id the course is cached and recorded under: analytics, locks and enrolment all key on it. */
  readonly courseId: CourseId;
  readonly courseUrl: string;
  readonly protocol: "https://" | "http://";
}

const LOCAL_HOST = /^(localhost|\d{1,3}(\.\d{1,3}){3})$/;

/**
 * Resolves what a course was opened by to the one place it is served and the one id it is known
 * under. A bare id is `<id>.netlify.app`; localhost and IPv4 addresses default to http, anything
 * else to https. An explicit scheme is kept. A Netlify site keeps its bare id, so analytics, locks
 * and enrolment keys are the same whichever form was used. Trailing slashes, the query and the
 * fragment are dropped: tutors.json sits at the course root.
 * @throws Error for a scheme other than http or https, credentials in the URL, or input that is not a URL
 */
export function courseAddress(input: string): CourseAddress {
  const address = input.trim();
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(address)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") {
    throw new Error(`Unsupported course URL scheme "${scheme}:" in "${input}"`);
  }
  const isBareId = !scheme && /^[^./:?#]+$/.test(address) && address !== "localhost";
  const target = isBareId ? `${address}.netlify.app` : address;

  let url: URL;
  try {
    url = new URL(scheme ? target : `https://${target}`);
  } catch {
    throw new Error(`Malformed course URL "${input}"`);
  }
  if (!url.hostname || url.username || url.password) {
    throw new Error(`Malformed course URL "${input}"`);
  }

  const protocol = scheme ? (`${scheme}://` as CourseAddress["protocol"]) : LOCAL_HOST.test(url.hostname) ? "http://" : "https://";
  let path = url.pathname;
  // A loop, not /\/+$/: that regex backtracks polynomially on input with many slashes (CodeQL js/polynomial-redos).
  while (path.endsWith("/")) path = path.slice(0, -1);
  const courseUrl = `${url.host}${path}`;

  if (isBareId) return { courseId: address as CourseId, courseUrl, protocol };
  const courseId = url.hostname.endsWith(".netlify.app") ? courseUrl.replace(".netlify.app", "") : courseUrl;
  return { courseId: courseId as CourseId, courseUrl, protocol };
}

/** The URL a course's tutors.json is published at. */
export function tutorsJsonUrl(address: Pick<CourseAddress, "courseUrl" | "protocol">): string {
  return `${address.protocol}${address.courseUrl}/tutors.json`;
}
