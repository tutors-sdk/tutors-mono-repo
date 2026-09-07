import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { parseCourse } from "../../../packages/jsr/gen/src/tutors";

/**
 * Contract between the course builder and the time app's educator gate
 * (issue #155).
 *
 * `requireEducator` decides who may read a course's shared snippets by
 * fetching the published `tutors.json` and reading
 * `enrollment.educators` — the `educators:` list from the course's
 * `enrollment.yaml`. That is a cross-package, cross-app coupling with no type
 * connecting the two ends, so it is asserted here against a real build rather
 * than a hand-written fixture: if the builder ever stops emitting the list, or
 * renames the field, the gate silently denies every educator on every course.
 *
 * Note this is a property of the *build*. A course that has not been
 * republished since gaining an `enrollment.yaml` still serves a `tutors.json`
 * without one, and the gate will (correctly, and by design) fail closed.
 */

const FIXTURE = resolve(__dirname, "../support/fixtures/enrollment-course");

/** What actually lands on disk: `generateDynamicCourse` does `JSON.stringify(lo)`. */
function publishedCourseJson(): Record<string, unknown> {
  const [course] = parseCourse(FIXTURE, true);
  return JSON.parse(JSON.stringify(course));
}

describe("enrollment publication contract", () => {
  it("serialises the educators list into the published course JSON", () => {
    const published = publishedCourseJson() as {
      enrollment?: { educators?: string[] };
    };
    expect(published.enrollment?.educators).toEqual(["lecturer-one", "lecturer-two"]);
  });

  it("keeps the field path the educator gate reads", () => {
    // requireEducator does exactly this, on a parsed fetch response.
    const course = publishedCourseJson() as { enrollment?: { educators?: string[] } };
    const educators = course.enrollment?.educators ?? [];
    expect(educators).toContain("lecturer-one");
    expect(educators.length).toBeGreaterThan(0);
  });

  it("survives a JSON round-trip as plain strings", () => {
    const educators = (publishedCourseJson() as { enrollment: { educators: string[] } }).enrollment
      .educators;
    for (const e of educators) expect(typeof e).toBe("string");
  });
});
