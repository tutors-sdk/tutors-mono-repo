import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "../../bdd/support/svelte-runes-shim.ts";
import type { Course, Lo } from "@tutors/tutors-model-lib";

/**
 * A learning event leaves the browser once, as a fire-and-forget POST to the reader's server, which
 * publishes it to Tutors Live within the day's budget. The browser broadcasts nothing itself, even with
 * a Live course channel open in the same tab. The report failing, by rejecting or by `fetch` throwing
 * synchronously, must not stop the latest-LO upsert, and must reach the log.
 */

const { mockUpsert, mockChannel, allChannel, courseChannel, mockFetch } = vi.hoisted(() => {
  const allChannel = { httpSend: vi.fn() };
  const courseChannel = { send: vi.fn(), httpSend: vi.fn(), on: vi.fn(), subscribe: vi.fn() };
  courseChannel.on.mockReturnValue(courseChannel);
  courseChannel.subscribe.mockImplementation((callback?: (status: string) => void) => {
    callback?.("SUBSCRIBED");
    return courseChannel;
  });
  return {
    mockUpsert: vi.fn(),
    mockFetch: vi.fn(),
    allChannel,
    courseChannel,
    mockChannel: vi.fn((name: string) => (name === "tutors-all-course-access" ? allChannel : courseChannel))
  };
});

// `rune()` wraps a value in `$state`, which needs the Svelte compiler; the service only reads and writes `.value`.
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => {
  const rune = <T>(value: T) => ({ value });
  return { rune, tutorsId: rune(null) };
});

vi.mock("$app/env/public", () => ({ PUBLIC_ANON_MODE: "FALSE" }));

vi.mock("../../../packages/svelte/community/src/utils/supabase-client.ts", () => ({
  supabase: { channel: mockChannel, removeChannel: vi.fn() },
  upsertTutorsConnectLatestLo: mockUpsert,
  getTutorsConnectRecentLosByCourseId: vi.fn().mockResolvedValue([]),
  watchLiveTopic: vi.fn().mockResolvedValue("normal")
}));

vi.mock("../../../packages/svelte/utils/logger/src/index.ts", () => ({
  default: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), setDefaultLevel: vi.fn() }
}));

import { LIVE_ACTIVITY_ROUTE, presenceService } from "../../../packages/svelte/community/src/services/presence.svelte.ts";
import log from "../../../packages/svelte/utils/logger/src/index.ts";

const course = { courseId: "web-dev", courseUrl: "web-dev.netlify.app", title: "Web Development", properties: {} } as unknown as Course;
const lo = { title: "Lab 1", route: "/lab/web-dev/lab-1", img: "lab-1.png", type: "lab" } as unknown as Lo;
const student = { login: "alice", name: "Alice", image: "alice.png", share: true } as never;

async function sendAndSettle() {
  presenceService.sendLoEvent(course, lo, student);
  await Promise.resolve();
  await Promise.resolve();
}

describe("presence-service: a learning event goes to the reader's server, not over Realtime", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // An anonymous id is minted from localStorage even for a student who shares their name.
    vi.stubGlobal("window", { localStorage: { tutorsTimeId: "anon-1" } });
    vi.stubGlobal("fetch", mockFetch);
    presenceService.stopPresenceListener();
    // A Live course channel open in this tab: the event must not be sent on it either.
    await presenceService.startPresenceListener("web-dev");
  });

  afterEach(() => {
    presenceService.stopPresenceListener();
    vi.unstubAllGlobals();
  });

  it("posts the record once with keepalive, upserts it, and broadcasts nothing", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 202 }));

    await sendAndSettle();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0] as [string, NonNullable<Parameters<typeof fetch>[1]>];
    expect(url).toBe(LIVE_ACTIVITY_ROUTE);
    expect(init).toMatchObject({ method: "POST", keepalive: true, headers: { "content-type": "application/json" } });
    expect(JSON.parse(String(init.body))).toMatchObject({ courseId: "web-dev", title: "Lab 1", user: { id: "alice" } });
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ courseId: "web-dev", title: "Lab 1" }));
    expect(allChannel.httpSend).not.toHaveBeenCalled();
    expect(courseChannel.httpSend).not.toHaveBeenCalled();
    expect(courseChannel.send).not.toHaveBeenCalled();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("logs a rejected report and still upserts", async () => {
    mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));

    await sendAndSettle();

    expect(log.warn).toHaveBeenCalledWith("Reporting live activity failed:", expect.any(TypeError));
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ courseId: "web-dev", title: "Lab 1" }));
  });

  it("logs a fetch that throws synchronously and still upserts", async () => {
    mockFetch.mockImplementation(() => {
      throw new TypeError("keepalive body too large");
    });

    await sendAndSettle();

    expect(log.warn).toHaveBeenCalledWith("Reporting live activity failed:", expect.any(TypeError));
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ courseId: "web-dev", title: "Lab 1" }));
  });
});
