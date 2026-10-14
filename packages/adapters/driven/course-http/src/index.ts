/**
 * Reads a published course's tutors.json over HTTP: the application's CourseSource port.
 */
import { CourseNotFoundError, CourseUnreachableError, type CourseLocation, type CourseSource, type FetchLike } from "@tutors/application/ports";
import log, { serializeError } from "@tutors/logger";

/**
 * One fixed message per failure, with what varies in fields: log collectors (and the release
 * harness) group and diff lines by message, so the course and URL must not be baked into it.
 * `error` and `stack` are always present so the line's key set does not depend on the cause.
 */
function logCourseFetchFailure(courseId: string, courseUrl: string, cause?: unknown): void {
  log.error("Error fetching course", {
    courseId,
    url: `https://${courseUrl}/tutors.json`,
    ...(cause === undefined ? { error: null, stack: null } : serializeError(cause))
  });
}

/** `fetchFn` defaults to the platform's; a SvelteKit load passes its own so server reads carry the request. */
export function httpCourseSource(fetchFn: FetchLike = (url) => globalThis.fetch(url)): CourseSource {
  return {
    async load(location: CourseLocation, fetchOverride?: FetchLike): Promise<string> {
      const { courseId, courseUrl, protocol } = location;
      const response = await (fetchOverride ?? fetchFn)(`${protocol}${courseUrl}/tutors.json`).catch((cause: unknown) => {
        logCourseFetchFailure(courseId, courseUrl, cause);
        // A browser reports a host that does not exist, and a 404 sent without CORS headers, as a
        // TypeError with no status: the same TypeError as being offline.
        if (cause instanceof TypeError) throw new CourseUnreachableError(courseId, courseUrl, cause);
        throw cause;
      });
      if (response.status === 404) {
        logCourseFetchFailure(courseId, courseUrl);
        throw new CourseNotFoundError(courseId, courseUrl);
      }
      if (!response.ok) {
        const failure = new Error(`Fetch failed with status ${response.status}`);
        logCourseFetchFailure(courseId, courseUrl, failure);
        throw failure;
      }
      return response.text();
    }
  };
}
