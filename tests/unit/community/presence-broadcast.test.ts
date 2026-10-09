import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Course, Lo } from "@tutors/tutors-model-lib";

/**
 * The platform-wide broadcast is fire-and-forget: Tutors Live losing an event must not stop the
 * course channel or the latest-LO upsert behind it, and the loss must reach the log. `httpSend`
 * fails two ways - it rejects on a failed POST, and throws synchronously where the Realtime client
 * predates 2.97.0 - and each has its own arm in `sendLoEvent`.
 */

const { mockUpsert, mockChannel, allChannel, courseChannel } = vi.hoisted(() => {
  const allChannel = { httpSend: vi.fn() };
  const courseChannel = { send: vi.fn(), on: vi.fn(), subscribe: vi.fn() };
  courseChannel.on.mockReturnValue(courseChannel);
  courseChannel.subscribe.mockReturnValue(courseChannel);
  return {
    mockUpsert: vi.fn(),
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

vi.mock("$env/dynamic/public", () => ({ env: { PUBLIC_ANON_MODE: "FALSE" } }));

vi.mock("../../../packages/svelte/community/src/utils/supabase-client.ts", () => ({
  supabase: { channel: mockChannel, removeChannel: vi.fn() },
  upsertTutorsConnectLatestLo: mockUpsert
}));

vi.mock("../../../packages/svelte/utils/logger/src/index.ts", () => ({
  default: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), setDefaultLevel: vi.fn() }
}));

import { presenceService } from "../../../packages/svelte/community/src/services/presence.svelte.ts";
import log from "../../../packages/svelte/utils/logger/src/index.ts";

const course = { courseId: "web-dev", courseUrl: "web-dev.netlify.app", title: "Web Development", properties: {} } as unknown as Course;
const lo = { title: "Lab 1", route: "/lab/web-dev/lab-1", img: "lab-1.png", type: "lab" } as unknown as Lo;
const student = { login: "alice", name: "Alice", image: "alice.png", share: true } as never;

async function sendAndSettle() {
  presenceService.sendLoEvent(course, lo, student);
  await Promise.resolve();
  await Promise.resolve();
}

describe("presence-service: a failed platform-wide broadcast does not stop the rest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // An anonymous id is minted from localStorage even for a student who shares their name.
    vi.stubGlobal("window", { localStorage: { tutorsTimeId: "anon-1" } });
    presenceService.connectToAllCourseAccess();
    presenceService.startPresenceListener("web-dev");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("logs a rejected httpSend and still sends to the course channel and upserts", async () => {
    allChannel.httpSend.mockImplementation(() => Promise.reject(new Error("POST failed")));

    await sendAndSettle();

    expect(log.error).toHaveBeenCalledWith("Broadcast to tutors-all-course-access failed:", expect.any(Error));
    expect(courseChannel.send).toHaveBeenCalledWith(expect.objectContaining({ event: "lo-event" }));
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ courseId: "web-dev", title: "Lab 1" }));
  });

  it("logs an httpSend that throws synchronously and still sends to the course channel and upserts", async () => {
    allChannel.httpSend.mockImplementation(() => {
      throw new TypeError("httpSend is not a function");
    });

    await sendAndSettle();

    expect(log.error).toHaveBeenCalledWith("Broadcast to tutors-all-course-access failed:", expect.any(TypeError));
    expect(courseChannel.send).toHaveBeenCalledWith(expect.objectContaining({ event: "lo-event" }));
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ courseId: "web-dev", title: "Lab 1" }));
  });

  it("logs nothing when httpSend resolves", async () => {
    allChannel.httpSend.mockResolvedValue(undefined);

    await sendAndSettle();

    expect(allChannel.httpSend).toHaveBeenCalledWith("lo-event", expect.objectContaining({ courseId: "web-dev" }));
    expect(log.error).not.toHaveBeenCalled();
  });
});
