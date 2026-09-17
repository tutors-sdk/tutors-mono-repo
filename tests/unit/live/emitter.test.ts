import { describe, expect, it, vi } from "vitest";
import { createLiveEmitter, type LiveEvent, type SidStorage } from "@tutors/live-events";

/**
 * The emitter runs inside the reader, where telemetry has no right to cost
 * anyone a page. So: no endpoint means no work at all, a failing endpoint is
 * swallowed, and a session that goes quiet is closed rather than left open.
 */

function storage(): SidStorage {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    }
  };
}

function at(minutes: number): Date {
  return new Date(Date.UTC(2026, 8, 17, 10, minutes, 0));
}

function build(overrides: Parameters<typeof createLiveEmitter>[0] = {}) {
  const posted: LiveEvent[][] = [];
  const fetchStub = vi.fn(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    posted.push(JSON.parse(String(init?.body)) as LiveEvent[]);
    return new Response(null, { status: 202 });
  });
  const emitter = createLiveEmitter({
    endpoint: "https://live.example/api/live/events",
    fetch: fetchStub as unknown as typeof fetch,
    storage: storage(),
    ...overrides
  });
  return { emitter, posted, fetchStub };
}

describe("live emitter", () => {
  it("is inert with no endpoint configured", async () => {
    const emitter = createLiveEmitter({ storage: storage() });
    emitter.courseOpened("cs101");
    emitter.loViewed("cs101", "/topic/1", "lab");
    await emitter.flush();
    expect(emitter.enabled).toBe(false);
    expect(emitter.pending()).toEqual([]);
  });

  it("opens a session before the first event and stamps every event with the same token", () => {
    let minute = 0;
    const { emitter } = build({ now: () => at(minute) });

    emitter.courseOpened("cs101");
    minute = 1;
    emitter.loViewed("cs101", "/topic/1/lab-1", "lab");
    emitter.serviceUsed("cs101", "lab");

    const queued = emitter.pending();
    expect(queued.map((event) => event.type)).toEqual(["session.started", "course.opened", "lo.viewed", "service.used"]);
    expect(new Set(queued.map((event) => event.sid))).toEqual(new Set([emitter.sid]));
  });

  it("stamps an opted-in identifier on the session, and nothing else", () => {
    const { emitter } = build({ now: () => at(0), uid: () => "hashed-uid" });
    emitter.courseOpened("cs101");
    emitter.loViewed("cs101", "/topic/1", "lab");

    const [started, , viewed] = emitter.pending();
    expect(started).toMatchObject({ type: "session.started", uid: "hashed-uid" });
    expect(viewed).not.toHaveProperty("uid");
  });

  it("closes a session that went idle and opens a fresh one on the next event", () => {
    let minute = 0;
    const { emitter } = build({ now: () => at(minute), sessionIdleMs: 30 * 60 * 1000 });

    emitter.courseOpened("cs101");
    minute = 5;
    emitter.loViewed("cs101", "/topic/1", "lab");
    minute = 90;
    emitter.loViewed("cs101", "/topic/2", "talk");

    const types = emitter.pending().map((event) => event.type);
    expect(types).toEqual(["session.started", "course.opened", "lo.viewed", "session.ended", "session.started", "lo.viewed"]);
    const ended = emitter.pending().find((event) => event.type === "session.ended");
    expect(ended).toMatchObject({ durationSec: 5 * 60 });
  });

  it("reports the duration from the session start when it is closed explicitly", () => {
    let minute = 0;
    const { emitter } = build({ now: () => at(minute) });
    emitter.courseOpened("cs101");
    minute = 12;
    emitter.sessionEnded("cs101");
    expect(emitter.pending().at(-1)).toMatchObject({ type: "session.ended", durationSec: 720 });
  });

  it("posts once the batch is full, and clears what it posted", async () => {
    const minute = 0;
    const { emitter, posted } = build({ now: () => at(minute), batchSize: 3 });

    emitter.courseOpened("cs101");
    emitter.loViewed("cs101", "/topic/1", "lab");
    await emitter.flush();

    expect(posted).toHaveLength(1);
    expect(posted[0].map((event) => event.type)).toEqual(["session.started", "course.opened", "lo.viewed"]);
    expect(emitter.pending()).toEqual([]);
  });

  it("swallows a failing endpoint and tells the caller, rather than throwing into the page", async () => {
    const onError = vi.fn();
    const emitter = createLiveEmitter({
      endpoint: "https://live.example/api/live/events",
      storage: storage(),
      now: () => at(0),
      onError,
      fetch: (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch
    });

    emitter.courseOpened("cs101");
    await expect(emitter.flush()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledOnce();
  });

  it("puts the batch back when a beacon is refused, so it can go out on the next flush", () => {
    const { emitter } = build({ now: () => at(0), sendBeacon: () => false });
    emitter.courseOpened("cs101");
    const before = emitter.pending().length;
    emitter.flushBeacon();
    expect(emitter.pending()).toHaveLength(before);
  });

  it("sends the queue as JSON when the beacon is accepted", () => {
    const sent: { url: string; body: string }[] = [];
    const { emitter } = build({
      now: () => at(0),
      sendBeacon: (url, body) => {
        sent.push({ url, body });
        return true;
      }
    });
    emitter.courseOpened("cs101");
    emitter.flushBeacon();

    expect(emitter.pending()).toEqual([]);
    expect(JSON.parse(sent[0].body).map((event: LiveEvent) => event.type)).toEqual(["session.started", "course.opened"]);
  });
});
