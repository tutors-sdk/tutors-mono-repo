import type { CourseFactsLookup, CourseFactsSource } from "@tutors/application/ports";
import { courseFactsFrom, courseJsonUrl, redirectTarget } from "@tutors/domain/access";

export type PublishedFactsOptions = {
  fetch: typeof fetch;
  /** Extra host names allowed to serve tutors.json, beyond Netlify sites. */
  allowedHosts?: readonly string[];
  /** How long one request to a course's host may take. */
  timeoutMs?: number;
};

const MAX_REDIRECTS = 3;

/**
 * The CourseFactsSource a server uses: a course's published tutors.json, fetched from a host the
 * domain trusts (courseJsonUrl) and nowhere a redirect could smuggle the request (redirectTarget).
 * A host that fails, times out, throttles or sends broken JSON is "unavailable"; one that has no
 * such course, or an id that names no trusted host, is "missing".
 */
export function publishedCourseFacts(options: PublishedFactsOptions): CourseFactsSource {
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    async read(courseId): Promise<CourseFactsLookup> {
      let url = courseJsonUrl(courseId, options.allowedHosts);
      if (!url) return { kind: "missing" };
      try {
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
          const response = await options.fetch(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
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
  };
}
