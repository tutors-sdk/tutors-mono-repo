import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseNotFoundError, courseService, setCourseNotFoundHandler } from "../../../packages/svelte/course/src/course/services/course.svelte.ts";

// `rune()` wraps a value in `$state`, which needs the Svelte compiler; the service only reads and writes `.value`.
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => {
  const rune = <T>(value: T) => ({ value });
  return { rune, courseProtocol: rune("https://"), currentCourse: rune(null), currentLo: rune(null), isEducator: rune(false) };
});

const answering = (status: number) => (async () => new Response("", { status })) as unknown as typeof fetch;
/** What a browser does for a host that does not exist, or a 404 sent without CORS headers. */
const unreachable = (async () => {
  throw new TypeError("Failed to fetch");
}) as unknown as typeof fetch;

async function failureOf(load: Promise<unknown>): Promise<unknown> {
  return load.then(
    () => undefined,
    (error) => error
  );
}

/**
 * SvelteKit renders an error made by the app's own `error()` with its status, and
 * anything else as a 500 "Server Error". The reader supplies that `error(404)`
 * through setCourseNotFoundHandler.
 */
describe("courseService: a course that does not exist", () => {
  afterEach(() => {
    setCourseNotFoundHandler((error) => {
      throw error;
    });
  });

  it.each([
    ["the host answers 404", answering(404)],
    ["the host cannot be reached", unreachable]
  ])("is a CourseNotFoundError when %s", async (_case, fetchFunction) => {
    const failure = await failureOf(courseService.readCourse("no-such-course", fetchFunction));
    expect(failure).toBeInstanceOf(CourseNotFoundError);
    expect((failure as CourseNotFoundError).message).toBe("Course no-such-course not found at https://no-such-course.netlify.app/tutors.json");
  });

  it("hands the failure to the app's handler, so the app can raise its own 404", async () => {
    const appError = { status: 404, body: { message: "from the app" } };
    const handler = vi.fn((): never => {
      throw appError;
    });
    setCourseNotFoundHandler(handler);

    expect(await failureOf(courseService.readCourse("no-such-course", unreachable))).toBe(appError);
    expect(handler).toHaveBeenCalledWith(expect.any(CourseNotFoundError));
  });

  it("does not cache the failure", async () => {
    await failureOf(courseService.readCourse("late-course", answering(404)));
    expect(courseService.courses.has("late-course")).toBe(false);
  });

  it("leaves any other failed fetch as an unexpected error", async () => {
    const failure = await failureOf(courseService.readCourse("broken-course", answering(500)));
    expect(failure).not.toBeInstanceOf(CourseNotFoundError);
    expect((failure as Error).message).toBe("Fetch failed with status 500");
  });
});
