import { afterEach, describe, expect, it, vi } from "vitest";
import { addTransport, removeTransport, type LogEntry } from "../../../packages/svelte/utils/logger/src/index.ts";
import { CourseNotFoundError, courseService, setCourseNotFoundHandler, setCourseUnreachableHandler } from "../../../packages/svelte/course/src/course/services/course.svelte.ts";

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
    setCourseUnreachableHandler((cause) => {
      throw cause;
    });
  });

  it("is a CourseNotFoundError when the host answers 404", async () => {
    const failure = await failureOf(courseService.readCourse("no-such-course", answering(404)));
    expect(failure).toBeInstanceOf(CourseNotFoundError);
    expect(failure).toMatchObject({ message: "Fetch failed with status 404", courseId: "no-such-course", courseUrl: "no-such-course.netlify.app" });
  });

  it("lets the TypeError through when the host cannot be reached, so offline is not 'not found'", async () => {
    const failure = await failureOf(courseService.readCourse("no-such-course", unreachable));
    expect(failure).toBeInstanceOf(TypeError);
    expect(failure).not.toBeInstanceOf(CourseNotFoundError);
    expect((failure as Error).message).toBe("Failed to fetch");
  });

  it("hands a 404 to the app's handler, so the app can raise its own 404", async () => {
    const appError = { status: 404, body: { message: "from the app" } };
    const handler = vi.fn((): never => {
      throw appError;
    });
    setCourseNotFoundHandler(handler);

    expect(await failureOf(courseService.readCourse("no-such-course", answering(404)))).toBe(appError);
    expect(handler).toHaveBeenCalledWith(expect.any(CourseNotFoundError));
  });

  it("hands an unreachable host to the app's handler, so the app can choose how to show it", async () => {
    const appError = { status: 404, body: { message: "from the app" } };
    const handler = vi.fn((): never => {
      throw appError;
    });
    setCourseUnreachableHandler(handler);

    expect(await failureOf(courseService.readCourse("no-such-course", unreachable))).toBe(appError);
    expect(handler).toHaveBeenCalledWith(expect.any(TypeError));
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

describe("courseService: a failed fetch is logged with a fixed message", () => {
  afterEach(() => {
    setCourseNotFoundHandler((error) => {
      throw error;
    });
    setCourseUnreachableHandler((cause) => {
      throw cause;
    });
  });

  /** Run `load` and return every entry the logger wrote meanwhile. */
  async function logged(load: Promise<unknown>): Promise<LogEntry[]> {
    const entries: LogEntry[] = [];
    const transport = (entry: LogEntry) => void entries.push(entry);
    addTransport(transport);
    try {
      await failureOf(load);
    } finally {
      removeTransport(transport);
    }
    return entries;
  }

  it("keeps the course and URL out of the message, so two courses give the same message and key set", async () => {
    const a = await logged(courseService.readCourse("first-missing", answering(404)));
    const b = await logged(courseService.readCourse("second-missing", answering(404)));

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]!.message).toBe("Error fetching course");
    expect(b[0]!.message).toBe(a[0]!.message);
    expect(a[0]).toMatchObject({ courseId: "first-missing", url: "https://first-missing.netlify.app/tutors.json" });
    expect(Object.keys(b[0]!)).toEqual(Object.keys(a[0]!));
  });

  it("has the same keys whether the fetch threw or the host answered", async () => {
    const answered = await logged(courseService.readCourse("gone", answering(404)));
    const threw = await logged(courseService.readCourse("offline", unreachable));

    expect(threw).toHaveLength(1);
    expect(threw[0]!.message).toBe("Error fetching course");
    expect(threw[0]).toMatchObject({ error: "Failed to fetch" });
    expect(Object.keys(threw[0]!).sort()).toEqual(Object.keys(answered[0]!).sort());
  });
});
