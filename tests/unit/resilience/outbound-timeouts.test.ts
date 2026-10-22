import { afterEach, describe, expect, it, vi } from "vitest";
import { OUTBOUND_TIMEOUT_MS, withTimeout } from "../../../packages/svelte/utils/logger/src/index.ts";
import { SUPABASE_TIMEOUT_MS, timedFetch } from "../../../packages/jsr/time/src/services/supabase.ts";
import { COURSE_FETCH_TIMEOUT_MS, courseService, setCourseTimedOutHandler } from "../../../packages/svelte/course/src/course/services/course.svelte.ts";

// `rune()` wraps a value in `$state`, which needs the Svelte compiler; the service only reads and writes `.value`.
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => {
  const rune = <T>(value: T) => ({ value });
  return { rune, courseProtocol: rune("https://"), currentCourse: rune(null), currentLo: rune(null), isEducator: rune(false) };
});

/**
 * Rules 0614 and 0615: every call to a dependency is time-bounded. Each fetch below never answers on its own; it
 * settles only when the signal it was given aborts, as a real fetch does.
 */
const neverAnswers = vi.fn(
  (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
    new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal!.reason)))
) as unknown as typeof fetch;

afterEach(() => {
  vi.useRealTimers();
  setCourseTimedOutHandler((cause) => {
    throw cause;
  });
  courseService.courses.clear();
});

const failureOf = (p: Promise<unknown>) => p.then(() => undefined, (e: unknown) => e);

describe.each([
  ["withTimeout (@tutors/logger: the reader, catalogue, live and time apps' Supabase)", (ms: number) => withTimeout(neverAnswers, ms), OUTBOUND_TIMEOUT_MS],
  ["timedFetch (@tutors/tutors-time-lib's Supabase)", (ms: number) => timedFetch(ms, neverAnswers), SUPABASE_TIMEOUT_MS]
])("%s", (_name, wrap, defaultMs) => {
  it("abandons a call that has not answered with a TimeoutError", async () => {
    vi.useFakeTimers();
    const call = failureOf(wrap(1_000)("https://supabase.example/rest/v1/x"));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await call).toMatchObject({ name: "TimeoutError" });
  });

  it("still aborts on the caller's own signal", async () => {
    const caller = new AbortController();
    const call = failureOf(wrap(60_000)("https://supabase.example/rest/v1/x", { signal: caller.signal }));
    caller.abort(new Error("caller gave up"));
    expect(await call).toMatchObject({ message: "caller gave up" });
  });

  it("gives a dependency 10 seconds by default", () => {
    expect(defaultMs).toBe(10_000);
  });
});

it.each([
  ["withTimeout", (f: typeof fetch) => withTimeout(f)],
  ["timedFetch", (f: typeof fetch) => timedFetch(undefined, f)]
])("%s passes an answer through untouched", async (_name, wrap) => {
  const answer = new Response("ok");
  expect(await wrap((async () => answer) as unknown as typeof fetch)("https://x.example")).toBe(answer);
});

describe("courseService: a course host that never answers (Rule 0614)", () => {
  it("gives up on tutors.json after COURSE_FETCH_TIMEOUT_MS and calls the timed-out handler", async () => {
    vi.useFakeTimers();
    const handled = vi.fn((cause: DOMException): never => {
      throw new Error(`504: ${cause.name}`);
    });
    setCourseTimedOutHandler(handled);
    const load = failureOf(courseService.readCourse("stalled.example", neverAnswers));
    await vi.advanceTimersByTimeAsync(COURSE_FETCH_TIMEOUT_MS);
    expect(await load).toMatchObject({ message: "504: TimeoutError" });
    expect(handled).toHaveBeenCalledOnce();
    expect(COURSE_FETCH_TIMEOUT_MS).toBe(15_000);
  });

  it("is a TimeoutError when no app set a handler", async () => {
    vi.useFakeTimers();
    const load = failureOf(courseService.readCourse("stalled.example", neverAnswers));
    await vi.advanceTimersByTimeAsync(COURSE_FETCH_TIMEOUT_MS);
    expect(await load).toMatchObject({ name: "TimeoutError" });
  });

  it("does not call the timed-out handler for a host that answers", async () => {
    const handled = vi.fn((): never => {
      throw new Error("unexpected");
    });
    setCourseTimedOutHandler(handled);
    const failure = await failureOf(courseService.readCourse("broken.example", (async () => new Response("", { status: 500 })) as unknown as typeof fetch));
    expect(failure).toMatchObject({ message: "Fetch failed with status 500" });
    expect(handled).not.toHaveBeenCalled();
  });
});
