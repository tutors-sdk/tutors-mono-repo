/**
 * Reads a published course's tutors.json over HTTP: the application's CourseSource port.
 */
import {
  COURSE_FETCH_TIMEOUT_MS,
  CourseNotFoundError,
  CourseTimedOutError,
  CourseUnreachableError,
  type CourseLocation,
  type CourseSource,
  type FetchLike
} from "@tutors/application/ports";
import log, { serializeError, withTimeout } from "@tutors/logger";

/**
 * One fixed message per failure, with what varies in fields: log collectors (and the release
 * harness) group and diff lines by message, so the course and URL must not be baked into it.
 * `error` and `stack` are always present so the line's key set does not depend on the cause.
 */
function logCourseFetchFailure(courseId: string, url: string, cause?: unknown): void {
  log.error("Error fetching course", {
    courseId,
    url,
    ...(cause === undefined ? { error: null, stack: null } : serializeError(cause))
  });
}

const isTimeout = (cause: unknown): cause is DOMException => cause instanceof DOMException && cause.name === "TimeoutError";

/**
 * `fetchFn` defaults to the platform's; a SvelteKit load passes its own so server reads carry the
 * request. A host that accepts the connection and never answers would otherwise leave the page
 * loading for as long as the browser keeps the request open, so the fetch is aborted after
 * COURSE_FETCH_TIMEOUT_MS; the deadline covers the body too.
 */
export function httpCourseSource(fetchFn: FetchLike = (url) => globalThis.fetch(url)): CourseSource {
  return {
    async load(location: CourseLocation, fetchOverride?: FetchLike): Promise<string> {
      const { courseId, courseUrl, protocol } = location;
      const url = `${protocol}${courseUrl}/tutors.json`;
      const fetchWithDeadline = withTimeout((fetchOverride ?? fetchFn) as unknown as typeof fetch, COURSE_FETCH_TIMEOUT_MS);
      const response = await fetchWithDeadline(url).catch((cause: unknown) => {
        logCourseFetchFailure(courseId, url, cause);
        if (isTimeout(cause)) throw new CourseTimedOutError(courseId, courseUrl, cause);
        // A browser reports a host that does not exist, and a 404 sent without CORS headers, as a
        // TypeError with no status: the same TypeError as being offline.
        if (cause instanceof TypeError) throw new CourseUnreachableError(courseId, courseUrl, cause);
        throw cause;
      });
      if (response.status === 404) {
        logCourseFetchFailure(courseId, url);
        throw new CourseNotFoundError(courseId, courseUrl);
      }
      if (!response.ok) {
        const failure = new Error(`Fetch failed with status ${response.status}`);
        logCourseFetchFailure(courseId, url, failure);
        throw failure;
      }
      return response.text().catch((cause: unknown) => {
        logCourseFetchFailure(courseId, url, cause);
        // The host answered the headers and then stalled on the body: the same timeout, met later.
        if (isTimeout(cause)) throw new CourseTimedOutError(courseId, courseUrl, cause);
        throw cause;
      });
    }
  };
}

export { publishedCourseFacts, type PublishedFactsOptions } from "./published-facts.ts";
