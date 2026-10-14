import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PresenceEvent } from "../../../packages/domain/src/presence/index.ts";

/**
 * The platform-wide broadcast is fire-and-forget: Tutors Live losing an event must not stop the
 * course channel or the latest-LO upsert behind it, and the loss must reach the log. `httpSend`
 * fails two ways - it rejects on a failed POST, and throws synchronously where the Realtime client
 * has no `httpSend` - and each has its own arm in the realtime adapter's publish.
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

vi.mock("../../../packages/platform/logger/src/index.ts", () => ({
  default: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), setDefaultLevel: vi.fn() }
}));

import { supabasePresence } from "../../../packages/adapters/driven/realtime-supabase/src/index.ts";
import log from "../../../packages/platform/logger/src/index.ts";

const client = { channel: mockChannel, removeChannel: vi.fn(), from: () => ({ upsert: mockUpsert }) };
const event = {
  courseId: "web-dev",
  courseUrl: "web-dev.netlify.app",
  courseTitle: "Web Development",
  title: "Lab 1",
  loRoute: "/lab/web-dev/lab-1",
  img: "lab-1.png",
  type: "lab",
  isPrivate: false,
  user: { fullName: "Alice", avatar: "alice.png", id: "alice" }
} as unknown as PresenceEvent;

async function publishAndSettle() {
  await supabasePresence(client as never, () => new Date("2026-10-14T10:00:00Z")).publish(event);
  await Promise.resolve();
}

describe("realtime adapter: a failed platform-wide broadcast does not stop the rest", () => {
  let presence: ReturnType<typeof supabasePresence>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({ error: null });
    presence = supabasePresence(client as never);
    // The reader that has joined the course channel sends on it rather than by HTTP.
    presence.subscribe(() => undefined, "web-dev");
  });

  it("logs a rejected httpSend and still sends to the course channel and upserts", async () => {
    allChannel.httpSend.mockImplementation(() => Promise.reject(new Error("POST failed")));

    await presence.publish(event);
    await Promise.resolve();

    expect(log.error).toHaveBeenCalledWith("Broadcast to tutors-all-course-access failed:", expect.any(Error));
    expect(courseChannel.send).toHaveBeenCalledWith(expect.objectContaining({ event: "lo-event" }));
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ course_id: "web-dev", student_id: "alice" }), { onConflict: "course_id,student_id" });
  });

  it("logs an httpSend that throws synchronously and still sends to the course channel and upserts", async () => {
    allChannel.httpSend.mockImplementation(() => {
      throw new TypeError("httpSend is not a function");
    });

    await presence.publish(event);

    expect(log.error).toHaveBeenCalledWith("Broadcast to tutors-all-course-access failed:", expect.any(TypeError));
    expect(courseChannel.send).toHaveBeenCalledWith(expect.objectContaining({ event: "lo-event" }));
    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ payload: expect.objectContaining({ courseId: "web-dev", title: "Lab 1" }) }), expect.anything());
  });

  it("logs nothing when httpSend resolves", async () => {
    allChannel.httpSend.mockResolvedValue(undefined);

    await presence.publish(event);

    expect(allChannel.httpSend).toHaveBeenCalledWith("lo-event", expect.objectContaining({ courseId: "web-dev" }));
    expect(log.error).not.toHaveBeenCalled();
  });

  it("stamps the stored snapshot with the clock it was given", async () => {
    allChannel.httpSend.mockResolvedValue(undefined);

    await publishAndSettle();

    expect(mockUpsert).toHaveBeenCalledWith(expect.objectContaining({ received_at: "2026-10-14T10:00:00.000Z" }), expect.anything());
  });
});
