import "../../bdd/support/svelte-runes-shim.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The live service's listeners (packages/svelte/community/src/services/live.svelte.ts), on today's Realtime seam: a
 * course or the platform is one `realtime.subscribe` plus one stored-activity feed (`watchLiveFeed`). This file was
 * written for the Supabase channel API in #327's branch and dropped in its rebase while its nightly mutation floor
 * (71) stayed; it is rewritten here so the floor is met again.
 */
type OnMessage = (event: string, payload: unknown) => void;

const seam = vi.hoisted(() => ({
  anonMode: "",
  client: {} as unknown,
  subscribed: [] as { topic: string; events: string[]; onMessage: OnMessage; options: unknown }[],
  closed: [] as string[],
  feeds: [] as { topic: string; read: (since: string) => unknown; onRecord: (record: unknown) => void }[],
  stoppedFeeds: [] as string[],
  reads: [] as string[]
}));

vi.mock("$app/env/public", () => ({
  get PUBLIC_ANON_MODE() {
    return seam.anonMode;
  }
}));

vi.mock("../../../packages/svelte/community/src/utils/supabase-client.ts", () => ({
  get supabase() {
    return seam.client;
  },
  getTutorsConnectRecentLos: (since: string) => (seam.reads.push(`all ${since}`), []),
  getTutorsConnectRecentLosByCourseId: (courseId: string, since: string) => (seam.reads.push(`${courseId} ${since}`), [])
}));

vi.mock("../../../packages/svelte/community/src/services/realtime.ts", () => ({
  realtime: {
    subscribe(topic: string, handlers: { events: string[]; onMessage: OnMessage }, options: unknown) {
      seam.subscribed.push({ topic, events: handlers.events, onMessage: handlers.onMessage, options });
      return { close: async () => void seam.closed.push(topic) };
    }
  }
}));

vi.mock("../../../packages/svelte/community/src/services/live-feed.ts", () => ({
  watchLiveFeed(topic: string, read: (since: string) => unknown, onRecord: (record: unknown) => void) {
    seam.feeds.push({ topic, read, onRecord });
    return () => void seam.stoppedFeeds.push(topic);
  }
}));

import { liveService } from "../../../packages/svelte/community/src/services/live.svelte.ts";

function loEvent(login: string, courseId: string, loRoute = `/lab/${courseId}/lab-1`) {
  return { courseId, user: { id: login, fullName: login }, loRoute };
}

beforeEach(() => {
  liveService.stopGlobalPresenceService();
  seam.anonMode = "";
  seam.client = {};
  seam.subscribed = [];
  seam.closed = [];
  seam.feeds = [];
  seam.stoppedFeeds = [];
  seam.reads = [];
  liveService.courseSubscription = null;
  liveService.listeningForCourse.value = "";
  liveService.studentsOnline.value = [];
  liveService.studentEventMap.clear();
});

describe("live service: one course", () => {
  it("subscribes to the course's lo-events, hearing its own, and lists each student once, keeping their latest page", () => {
    liveService.startCoursePresenceListener("web-dev-101");

    expect(liveService.listeningForCourse.value).toBe("web-dev-101");
    expect(seam.subscribed.map(({ topic, events, options }) => ({ topic, events, options }))).toEqual([{ topic: "web-dev-101", events: ["lo-event"], options: { self: true } }]);
    const { onMessage } = seam.subscribed[0]!;
    onMessage("lo-event", loEvent("alice", "web-dev-101"));
    onMessage("lo-event", loEvent("alice", "web-dev-101", "/lab/web-dev-101/lab-2"));
    onMessage("lo-event", loEvent("bob", "web-dev-101"));
    onMessage("lo-event", { courseId: "web-dev-101" });

    expect(liveService.studentsOnline.value.map((s) => s.user?.id)).toEqual(["alice", "bob"]);
    expect(liveService.studentEventMap.get("alice")?.loRoute).toBe("/lab/web-dev-101/lab-2");
  });

  it("reads the course's stored activity into the same list", () => {
    liveService.startCoursePresenceListener("web-dev-101");

    expect(seam.feeds.map((f) => f.topic)).toEqual(["web-dev-101"]);
    seam.feeds[0]!.read("2026-10-28T00:00:00Z");
    seam.feeds[0]!.onRecord(loEvent("carol", "web-dev-101"));
    expect(seam.reads).toEqual(["web-dev-101 2026-10-28T00:00:00Z"]);
    expect(liveService.studentsOnline.value.map((s) => s.user?.id)).toEqual(["carol"]);
  });

  it("does nothing more for the course it already listens to", () => {
    liveService.startCoursePresenceListener("web-dev-101");
    liveService.startCoursePresenceListener("web-dev-101");

    expect(seam.subscribed).toHaveLength(1);
    expect(seam.feeds).toHaveLength(1);
  });

  it("leaves the previous course and forgets its students when it switches course", () => {
    liveService.startCoursePresenceListener("web-dev-101");
    seam.subscribed[0]!.onMessage("lo-event", loEvent("alice", "web-dev-101"));

    const before = { closed: seam.closed.length, stopped: seam.stoppedFeeds.length };
    liveService.startCoursePresenceListener("data-101");

    expect(seam.closed.slice(before.closed)).toEqual(["web-dev-101"]);
    expect(seam.stoppedFeeds.slice(before.stopped)).toEqual(["web-dev-101"]);
    expect(seam.subscribed.at(-1)?.topic).toBe("data-101");
    expect(liveService.listeningForCourse.value).toBe("data-101");
    expect(liveService.studentsOnline.value).toEqual([]);
    expect(liveService.studentEventMap.size).toBe(0);
  });

  it("listens to nothing in anonymous mode or without a client", () => {
    seam.anonMode = "TRUE";
    liveService.startCoursePresenceListener("web-dev-101");
    seam.anonMode = "";
    seam.client = undefined;
    liveService.startCoursePresenceListener("web-dev-101");

    expect(seam.subscribed).toEqual([]);
    expect(seam.feeds).toEqual([]);
    expect(liveService.listeningForCourse.value).toBe("");
  });
});

describe("live service: the whole platform", () => {
  it("subscribes once to the platform's lo-events and lists each course and each student once", async () => {
    await liveService.startGlobalPresenceService();
    await liveService.startGlobalPresenceService();

    expect(seam.subscribed.map(({ topic, events, options }) => ({ topic, events, options }))).toEqual([{ topic: "tutors-all-course-access", events: ["lo-event"], options: { self: true } }]);
    const { onMessage } = seam.subscribed[0]!;
    onMessage("lo-event", loEvent("alice", "web-dev-101"));
    onMessage("lo-event", loEvent("bob", "web-dev-101", "/lab/web-dev-101/lab-2"));
    onMessage("lo-event", loEvent("alice", "data-101"));
    onMessage("lo-event", { user: { id: "nobody" } });

    expect(liveService.coursesOnline.value.map((c) => c.courseId)).toEqual(["web-dev-101", "data-101"]);
    expect(liveService.courseEventMap.get("web-dev-101")?.loRoute).toBe("/lab/web-dev-101/lab-2");
    expect(liveService.studentsOnline.value.map((s) => s.user?.id)).toEqual(["alice", "bob", "nobody"]);

    seam.feeds[0]!.read("2026-10-28T00:00:00Z");
    expect(seam.reads).toEqual(["all 2026-10-28T00:00:00Z"]);
  });

  it("stops: closes the subscription and the feed and empties every list, so it can start again", async () => {
    await liveService.startGlobalPresenceService();
    seam.subscribed[0]!.onMessage("lo-event", loEvent("alice", "web-dev-101"));

    liveService.stopGlobalPresenceService();

    expect(seam.closed).toEqual(["tutors-all-course-access"]);
    expect(seam.stoppedFeeds).toEqual(["tutors-all-course-access"]);
    expect(liveService.listeningAll).toBe(false);
    expect(liveService.coursesOnline.value).toEqual([]);
    expect(liveService.studentsOnline.value).toEqual([]);
    expect(liveService.courseEventMap.size).toBe(0);
    expect(liveService.studentEventMap.size).toBe(0);

    await liveService.startGlobalPresenceService();
    expect(seam.subscribed).toHaveLength(2);
  });

  it("listens to nothing in anonymous mode or without a client", async () => {
    seam.anonMode = "TRUE";
    await liveService.startGlobalPresenceService();
    seam.anonMode = "";
    seam.client = undefined;
    await liveService.startGlobalPresenceService();

    expect(seam.subscribed).toEqual([]);
    expect(liveService.listeningAll).toBe(false);
  });
});
