import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { insert } = vi.hoisted(() => ({ insert: vi.fn() }));

vi.mock(
  "../../../packages/svelte/community/src/utils/supabase-client.ts",
  () => ({
    supabase: { from: () => ({ insert }) },
  }),
);

vi.mock("$app/env/public", () => ({
  PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  PUBLIC_SUPABASE_ANON_KEY: "anon-key",
}));

import { createSupabaseErrorTransport } from "../../../packages/svelte/community/src/utils/error-transport.ts";

// The flush on page unload: tutors.dev answered it with 400 because the URL carried `Prefer=return=none`,
// which PostgREST parses as a filter (release harness rollback report, tutors-release-harness#38).
describe("error transport: flush on unload", () => {
  afterEach(() => vi.unstubAllGlobals());

  function unloadWith(
    navigator: Record<string, unknown>,
    fetch = vi.fn(() => Promise.resolve(new Response())),
  ) {
    let onUnload: (() => void) | undefined;
    vi.stubGlobal("window", {
      location: { href: "https://tutors.dev/note/course/x" },
      addEventListener: (type: string, fn: () => void) => {
        if (type === "beforeunload") onUnload = fn;
      },
    });
    vi.stubGlobal("navigator", { userAgent: "test", ...navigator });
    vi.stubGlobal("fetch", fetch);
    const send = createSupabaseErrorTransport("reader");
    send({
      timestamp: "t",
      level: "error",
      message: "boom",
      app: "reader",
    } as never);
    onUnload!();
    return fetch;
  }

  it("beacons to the table with only the key in the query string", () => {
    const sendBeacon = vi.fn(() => true);
    unloadWith({ sendBeacon });
    expect(sendBeacon).toHaveBeenCalledOnce();
    const [url] = sendBeacon.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      "https://project.supabase.co/rest/v1/app_errors?apikey=anon-key",
    );
    expect(new URL(url).searchParams.has("Prefer")).toBe(false);
  });

  it("falls back to a keepalive fetch that asks for no body in the header PostgREST reads", () => {
    const fetch = unloadWith({});
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0] as unknown as [
      string,
      NonNullable<Parameters<typeof fetch>[1]> & {
        headers: Record<string, string>;
      },
    ];
    expect(new URL(url).searchParams.has("Prefer")).toBe(false);
    expect(init.headers.Prefer).toBe("return=minimal");
    expect(init.keepalive).toBe(true);
  });
});

// The ordinary path: entries buffer until the batch is full, then go to the table in one insert.
describe("error transport: the full buffer", () => {
  beforeEach(() => {
    insert.mockClear();
    vi.stubGlobal("window", {
      location: { href: "https://tutors.dev/note/course/x" },
      addEventListener: () => {},
    });
    vi.stubGlobal("navigator", { userAgent: "test" });
  });
  afterEach(() => vi.unstubAllGlobals());

  function sendMany(count: number, level = "error") {
    const send = createSupabaseErrorTransport("reader");
    for (let i = 0; i < count; i++) {
      send({
        timestamp: "t",
        level,
        message: `boom ${i}`,
        app: "reader",
        courseId: "course-1",
        studentId: "student-1",
      } as never);
    }
  }

  it("writes the whole batch in one insert once 20 entries are buffered", () => {
    sendMany(20);
    expect(insert).toHaveBeenCalledOnce();
    const [rows] = insert.mock.calls[0] as unknown as [
      Record<string, unknown>[],
    ];
    expect(rows).toHaveLength(20);
    expect(rows[0]).toMatchObject({
      app: "reader",
      level: "error",
      message: "boom 0",
      course_id: "course-1",
      student_id: "student-1",
      url: "https://tutors.dev/note/course/x",
      user_agent: "test",
    });
  });

  it("keeps a partial batch buffered rather than writing it", () => {
    sendMany(19);
    expect(insert).not.toHaveBeenCalled();
    // The buffer outlives the transport, so empty it rather than leave 19 entries for the next test.
    sendMany(1);
    expect(insert).toHaveBeenCalledOnce();
  });

  it("ignores anything below warn, so a full buffer of debug writes nothing", () => {
    sendMany(20, "debug");
    expect(insert).not.toHaveBeenCalled();
  });
});
