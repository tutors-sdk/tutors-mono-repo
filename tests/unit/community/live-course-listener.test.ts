import "../../bdd/support/svelte-runes-shim.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (payload: { type: string; event: string; payload: unknown }) => void;

const realtime = vi.hoisted(() => ({
  client: undefined as unknown,
  anonMode: "FALSE",
  joined: [] as { name: string; event: string; handler: Handler }[],
  removed: [] as string[]
}));

vi.mock("$env/dynamic/public", () => ({
  env: {
    get PUBLIC_ANON_MODE() {
      return realtime.anonMode;
    }
  }
}));

vi.mock("../../../packages/svelte/community/src/utils/supabase-client.ts", () => ({
  get supabase() {
    return realtime.client;
  }
}));

import { liveService } from "../../../packages/svelte/community/src/services/live.svelte.ts";

function realtimeClient() {
  return {
    channel(name: string) {
      const channel = {
        name,
        on(_type: string, filter: { event: string }, handler: Handler) {
          realtime.joined.push({ name, event: filter.event, handler });
          return channel;
        },
        subscribe: () => channel
      };
      return channel;
    },
    removeChannel(channel: { name: string }) {
      realtime.removed.push(channel.name);
    }
  };
}

function loEvent(login: string, courseId: string) {
  return { type: "broadcast", event: "lo-event", payload: { courseId, user: { id: login, fullName: login }, loRoute: "/lab/web-dev-101/lab-1" } };
}

beforeEach(() => {
  realtime.client = realtimeClient();
  realtime.anonMode = "FALSE";
  realtime.joined = [];
  realtime.removed = [];
  liveService.channelCourse = null;
  liveService.studentsOnline.value = [];
  liveService.studentEventMap.clear();
});

describe("live service: listening to one course's Realtime channel", () => {
  it("joins the course's channel for lo-events and lists each student once", () => {
    liveService.startCoursePresenceListener("web-dev-101");

    expect(liveService.listeningForCourse.value).toBe("web-dev-101");
    expect(realtime.joined.map(({ name, event }) => ({ name, event }))).toEqual([{ name: "web-dev-101", event: "lo-event" }]);

    const { handler } = realtime.joined[0];
    handler(loEvent("alice", "web-dev-101"));
    handler(loEvent("alice", "web-dev-101"));
    handler(loEvent("bob", "web-dev-101"));
    expect(liveService.studentsOnline.value.map((s) => s.user?.id)).toEqual(["alice", "bob"]);
  });

  it("leaves the previous course's channel and forgets its students when it switches course", () => {
    liveService.startCoursePresenceListener("web-dev-101");
    realtime.joined[0].handler(loEvent("alice", "web-dev-101"));

    liveService.startCoursePresenceListener("data-101");

    expect(realtime.removed).toEqual(["web-dev-101"]);
    expect(realtime.joined.at(-1)?.name).toBe("data-101");
    expect(liveService.studentsOnline.value).toEqual([]);
    expect(liveService.studentEventMap.size).toBe(0);
  });

  it("joins nothing in anonymous mode or without a client", () => {
    realtime.anonMode = "TRUE";
    liveService.startCoursePresenceListener("web-dev-101");
    realtime.anonMode = "FALSE";
    realtime.client = undefined;
    liveService.startCoursePresenceListener("web-dev-101");

    expect(realtime.joined).toEqual([]);
  });
});
