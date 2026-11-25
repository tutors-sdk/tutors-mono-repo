import "../../bdd/support/svelte-runes-shim.ts";
import { beforeEach, describe, expect, it } from "vitest";
import type { PresenceFeed } from "../../../packages/application/src/ports/index.ts";
import type { PresenceEvent } from "../../../packages/domain/src/presence/index.ts";
import { anonymousAdapters, configureAdapters } from "../../../packages/adapters/driving/svelte-state/src/adapters.ts";
import { liveService } from "../../../packages/adapters/driving/svelte-state/src/community/services/live.svelte.ts";

/**
 * The live service's listeners (svelte-state/src/community/services/live.svelte.ts) over the
 * PresenceFeed port: a course, or the whole platform, is one `subscribe`, and what arrives is
 * listed once per student and per course. How a feed is delivered (Realtime, stored activity, the
 * day's budget) is the adapter's business: tests/unit/adapters/realtime-supabase-presence.test.ts.
 */
type Watch = { courseId?: string; listener: (event: PresenceEvent) => void; stopped: boolean };

const watches: Watch[] = [];
const feed: PresenceFeed = {
  subscribe(listener, courseId) {
    const watch: Watch = { courseId, listener, stopped: false };
    watches.push(watch);
    return () => void (watch.stopped = true);
  },
  recent: async () => []
};

function loEvent(login: string, courseId: string, loRoute = `/lab/${courseId}/lab-1`) {
  return { courseId, user: { id: login, fullName: login }, loRoute } as unknown as PresenceEvent;
}

function watching(): void {
  configureAdapters({ ...anonymousAdapters(), anonymous: false, presence: { ...feed, publish: async () => {} } });
}

beforeEach(() => {
  liveService.stopGlobalPresenceService();
  liveService.stopCoursePresenceListener();
  watches.length = 0;
  watching();
});

describe("live service: one course", () => {
  it("watches the course and lists each student once, keeping their latest page", () => {
    liveService.startCoursePresenceListener("web-dev-101");

    expect(liveService.listeningForCourse.value).toBe("web-dev-101");
    expect(watches.map((watch) => watch.courseId)).toEqual(["web-dev-101"]);
    const { listener } = watches[0]!;
    listener(loEvent("alice", "web-dev-101"));
    listener(loEvent("alice", "web-dev-101", "/lab/web-dev-101/lab-2"));
    listener(loEvent("bob", "web-dev-101"));
    listener({ courseId: "web-dev-101" } as unknown as PresenceEvent);

    expect(liveService.studentsOnline.value.map((s) => s.user?.id)).toEqual(["alice", "bob"]);
    expect(liveService.studentEventMap.get("alice")?.loRoute).toBe("/lab/web-dev-101/lab-2");
  });

  it("does nothing more for the course it already watches", () => {
    liveService.startCoursePresenceListener("web-dev-101");
    liveService.startCoursePresenceListener("web-dev-101");

    expect(watches).toHaveLength(1);
  });

  it("leaves the previous course and forgets its students when it switches course", () => {
    liveService.startCoursePresenceListener("web-dev-101");
    watches[0]!.listener(loEvent("alice", "web-dev-101"));

    liveService.startCoursePresenceListener("data-101");

    expect(watches.map((watch) => [watch.courseId, watch.stopped])).toEqual([
      ["web-dev-101", true],
      ["data-101", false]
    ]);
    expect(liveService.listeningForCourse.value).toBe("data-101");
    expect(liveService.studentsOnline.value).toEqual([]);
    expect(liveService.studentEventMap.size).toBe(0);
  });

  it("stops: leaves the course and empties its list", () => {
    liveService.startCoursePresenceListener("web-dev-101");
    watches[0]!.listener(loEvent("alice", "web-dev-101"));

    liveService.stopCoursePresenceListener();

    expect(watches[0]!.stopped).toBe(true);
    expect(liveService.listeningForCourse.value).toBe("");
    expect(liveService.studentsOnline.value).toEqual([]);
  });

  it("watches nothing where the app composed an anonymous deployment", () => {
    configureAdapters(anonymousAdapters({ presence: { ...feed, publish: async () => {} } }));
    liveService.startCoursePresenceListener("web-dev-101");

    expect(watches).toEqual([]);
    expect(liveService.listeningForCourse.value).toBe("");
  });
});

describe("live service: the whole platform", () => {
  it("watches every course once and lists each course and each student once", async () => {
    await liveService.startGlobalPresenceService();
    await liveService.startGlobalPresenceService();

    expect(watches.map((watch) => watch.courseId)).toEqual([undefined]);
    const { listener } = watches[0]!;
    listener(loEvent("alice", "web-dev-101"));
    listener(loEvent("bob", "web-dev-101", "/lab/web-dev-101/lab-2"));
    listener(loEvent("alice", "data-101"));
    listener({ user: { id: "nobody" } } as unknown as PresenceEvent);

    expect(liveService.coursesOnline.value.map((c) => c.courseId)).toEqual(["web-dev-101", "data-101"]);
    expect(liveService.courseEventMap.get("web-dev-101")?.loRoute).toBe("/lab/web-dev-101/lab-2");
    expect(liveService.studentsOnline.value.map((s) => s.user?.id)).toEqual(["alice", "bob", "nobody"]);
  });

  it("stops: leaves the feed and empties every list, so it can start again", async () => {
    await liveService.startGlobalPresenceService();
    watches[0]!.listener(loEvent("alice", "web-dev-101"));

    liveService.stopGlobalPresenceService();

    expect(watches[0]!.stopped).toBe(true);
    expect(liveService.listeningAll).toBe(false);
    expect(liveService.coursesOnline.value).toEqual([]);
    expect(liveService.studentsOnline.value).toEqual([]);
    expect(liveService.courseEventMap.size).toBe(0);
    expect(liveService.studentEventMap.size).toBe(0);

    await liveService.startGlobalPresenceService();
    expect(watches).toHaveLength(2);
  });

  it("watches nothing where the app composed an anonymous deployment", async () => {
    configureAdapters(anonymousAdapters({ presence: { ...feed, publish: async () => {} } }));
    await liveService.startGlobalPresenceService();

    expect(watches).toEqual([]);
    expect(liveService.listeningAll).toBe(false);
  });
});
