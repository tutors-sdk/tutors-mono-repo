import type { Course } from "@tutors/domain/course";

/** A course whose tutors.json is not there: the host answered 404. */
export class CourseNotFoundError extends Error {
  constructor(
    readonly courseId: string,
    readonly courseUrl: string
  ) {
    super("Fetch failed with status 404");
    this.name = "CourseNotFoundError";
  }
}

/**
 * A course site that cannot be reached: a host that does not exist, a 404 sent without CORS
 * headers, or being offline. `cause` is the TypeError the platform raised.
 */
export class CourseUnreachableError extends Error {
  constructor(
    readonly courseId: string,
    readonly courseUrl: string,
    override readonly cause: TypeError
  ) {
    super(cause.message);
    this.name = "CourseUnreachableError";
  }
}

/** Where a course's tutors.json is published. */
export type CourseLocation = {
  courseId: string;
  /** Host (and path) of the course site, without a protocol. */
  courseUrl: string;
  protocol: "https://" | "http://";
};

/**
 * The part of the platform's `fetch` a course source is handed: this ring names no platform, so
 * the type is spelled out rather than taken from the DOM library.
 */
export type FetchLike = (url: string) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

/** Reads a published course. The text comes back unparsed: the use case decides when to load maths before parsing. */
export interface CourseSource {
  /**
   * The tutors.json text of a course, or throws CourseNotFoundError, CourseUnreachableError, or an
   * Error naming the HTTP status. A SvelteKit load passes its own `fetch` so a server read carries the request.
   */
  load(location: CourseLocation, fetchFn?: FetchLike): Promise<string>;
}

/** Decorated course json, parsed. */
export type CourseJson = Course;
