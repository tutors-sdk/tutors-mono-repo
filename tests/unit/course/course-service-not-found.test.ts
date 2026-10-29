import { afterEach, describe, expect, it, vi } from "vitest";
import { Window } from "happy-dom";
import type { Course, Notebook } from "@tutors/tutors-model-lib";
import { currentLo } from "../../../packages/svelte/runes/src/index.svelte.ts";
import { addTransport, removeTransport, type LogEntry } from "../../../packages/svelte/utils/logger/src/index.ts";
import { COURSE_FETCH_TIMEOUT_MS, CourseNotFoundError, courseService, setCourseNotFoundHandler, setCourseTimedOutHandler, setCourseUnreachableHandler } from "../../../packages/svelte/course/src/course/services/course.svelte.ts";

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

it.each(["readNotebook", "readLo"] as const)("%s shares rendered notebook cells, outline and selection through the cache", async method => {
  const route = "/notebook/cached-notebook/example";
  const notebook = {
    type: "notebook", route,
    cells: [
      { cellType: "markdown", source: "Introduction\n\n## Exercise", outputs: [] },
      { cellType: "code", source: "print(1)", outputs: [{ outputType: "stream", text: "<output>" }] },
      { cellType: "raw", source: "<raw>", outputs: [] }
    ]
  } as Notebook;
  const course = { courseId: "cached-notebook", courseUrl: "example.invalid", loIndex: new Map([[route, notebook]]) } as unknown as Course;
  courseService.courses.set(course.courseId, course);
  try {
    await courseService[method](course.courseId, route, unreachable);
    const live = await courseService.readNotebook(course.courseId, route, unreachable);
    expect(live.outline).toEqual([{ index: 0, title: "Exercise" }]);
    expect(notebook.cells[0].sourceHtml).toContain("<h2");
    const window = new Window();
    const renderedCode = new window.DOMParser().parseFromString(notebook.cells[1].sourceHtml!, "text/html");
    expect(renderedCode.querySelector("code")?.textContent).toContain("print(1)");
    expect(notebook.cells[1].outputsHtml).toContain("&lt;output&gt;");
    expect(notebook.cells[2].sourceHtml).toContain("&lt;raw&gt;");
    live.setActiveCell(1);
    expect(await courseService.readLo(course.courseId, route, unreachable)).toBe(notebook);
    expect(await courseService.readNotebook(course.courseId, route, unreachable)).toBe(live);
    expect(live.activeCellIndex).toBe(1);
    expect(currentLo.value).toBe(notebook);
  } finally {
    courseService.courses.delete(course.courseId);
    courseService.notebooks.delete(route);
    currentLo.value = null;
  }
});

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

/** What withTimeout's AbortSignal.timeout gives a fetch, or a body read, that ran out of time. */
const timedOut = () => new DOMException("The operation timed out.", "TimeoutError");
const neverAnswers = (async () => {
  throw timedOut();
}) as unknown as typeof fetch;
const stallsOnBody = (async () => ({ ok: true, status: 200, text: async () => Promise.reject(timedOut()) })) as unknown as typeof fetch;

describe("courseService: a course host that never answers (Rule 0614)", () => {
  afterEach(() => {
    setCourseTimedOutHandler((cause) => {
      throw cause;
    });
  });

  it("gives the course host fifteen seconds", () => {
    expect(COURSE_FETCH_TIMEOUT_MS).toBe(15_000);
  });

  it("lets the TimeoutError through when no app handler is set", async () => {
    const failure = await failureOf(courseService.readCourse("stalled-course", neverAnswers));
    expect(failure).toBeInstanceOf(DOMException);
    expect((failure as DOMException).name).toBe("TimeoutError");
    expect(courseService.courses.has("stalled-course")).toBe(false);
  });

  it("hands a timed-out request to the app's handler", async () => {
    const appError = { status: 504, body: { message: "from the app" } };
    const handler = vi.fn((): never => {
      throw appError;
    });
    setCourseTimedOutHandler(handler);

    expect(await failureOf(courseService.readCourse("stalled-course", neverAnswers))).toBe(appError);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ name: "TimeoutError" }));
  });

  it("hands a body that stalls after the headers to the same handler", async () => {
    const appError = { status: 504, body: { message: "from the app" } };
    const handler = vi.fn((): never => {
      throw appError;
    });
    setCourseTimedOutHandler(handler);

    expect(await failureOf(courseService.readCourse("slow-body-course", stallsOnBody))).toBe(appError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does not treat an unreachable host as a timeout", async () => {
    const handler = vi.fn((): never => {
      throw new Error("not a timeout");
    });
    setCourseTimedOutHandler(handler);

    expect(await failureOf(courseService.readCourse("offline-course", unreachable))).toBeInstanceOf(TypeError);
    expect(handler).not.toHaveBeenCalled();
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
