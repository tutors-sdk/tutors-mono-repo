import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "../../bdd/support/svelte-runes-shim.ts";
import type { Course, Lo } from "@tutors/tutors-model-lib";

/**
 * A learning event leaves the browser through the PresencePublisher the reader composes
 * (`dataApiPresencePublisher`): once as a fire-and-forget POST to the reader's server, which
 * publishes it to Tutors Live within the day's budget, and once as the learner's latest snapshot
 * (POST /api/presence), which the server keeps. The browser broadcasts nothing itself. The live
 * report failing, by rejecting or by `fetch` throwing synchronously, must not stop the snapshot, and
 * must reach the log.
 */
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

// `rune()` wraps a value in `$state`, which needs the Svelte compiler; the service only reads and writes `.value`.
vi.mock("../../../packages/adapters/driving/svelte-state/src/index.svelte.ts", () => {
  const rune = <T>(value: T) => ({ value });
  return { rune, tutorsId: rune(null) };
});

vi.mock("@tutors/logger", () => ({
  default: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), setDefaultLevel: vi.fn() }
}));

import log from "@tutors/logger";
import { dataApiPresencePublisher, LIVE_ACTIVITY_ROUTE } from "../../../packages/adapters/driven/data-api/src/index.ts";
import { anonymousAdapters, configureAdapters } from "../../../packages/adapters/driving/svelte-state/src/adapters.ts";
import { presenceService } from "../../../packages/adapters/driving/svelte-state/src/community/services/presence.svelte.ts";

const course = { courseId: "web-dev", courseUrl: "web-dev.netlify.app", title: "Web Development", properties: {} } as unknown as Course;
const lo = { title: "Lab 1", route: "/lab/web-dev/lab-1", img: "lab-1.png", type: "lab" } as unknown as Lo;
const student = { login: "alice", name: "Alice", image: "alice.png", share: true } as never;

type Call = [string, NonNullable<Parameters<typeof fetch>[1]>];
const calls = () => mockFetch.mock.calls as unknown as Call[];
const snapshots = () => calls().filter(([url]) => url === "/api/presence");

async function sendAndSettle() {
  presenceService.sendLoEvent(course, lo, student);
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("presence: a learning event goes to the reader's server, not over Realtime", () => {
  const subscribed = vi.fn(() => () => {});

  beforeEach(async () => {
    vi.clearAllMocks();
    // An anonymous id is minted from localStorage even for a student who shares their name.
    vi.stubGlobal("window", { localStorage: { tutorsTimeId: "anon-1" } });
    vi.stubGlobal("fetch", mockFetch);
    // The reader's wiring for presence: watch through one adapter, publish through the data API.
    configureAdapters({ ...anonymousAdapters(), anonymous: false, presence: { subscribe: subscribed, recent: async () => [], ...dataApiPresencePublisher() } });
    presenceService.stopPresenceListener();
    // A Live course feed open in this tab: the event must not be sent on it either.
    await presenceService.startPresenceListener("web-dev");
  });

  afterEach(() => {
    presenceService.stopPresenceListener();
    vi.unstubAllGlobals();
  });

  it("posts the record once with keepalive, hands the snapshot to the server, and broadcasts nothing", async () => {
    mockFetch.mockResolvedValue(new Response(null, { status: 202 }));

    await sendAndSettle();

    const live = calls().filter(([url]) => url === LIVE_ACTIVITY_ROUTE);
    expect(live).toHaveLength(1);
    expect(live[0]![1]).toMatchObject({ method: "POST", keepalive: true, headers: { "content-type": "application/json" } });
    expect(JSON.parse(String(live[0]![1].body))).toMatchObject({ courseId: "web-dev", title: "Lab 1", user: { id: "alice" } });
    expect(snapshots()).toHaveLength(1);
    expect(JSON.parse(String(snapshots()[0]![1].body))).toMatchObject({ courseId: "web-dev", payload: { courseId: "web-dev", title: "Lab 1" } });
    // Nothing but those two requests left the browser; the feed it watches was only ever listened to.
    expect(calls()).toHaveLength(2);
    expect(subscribed).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("logs a rejected report and still hands over the snapshot", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url === LIVE_ACTIVITY_ROUTE) throw new TypeError("Failed to fetch");
      return new Response(null, { status: 204 });
    });

    await sendAndSettle();

    expect(log.warn).toHaveBeenCalledWith("Reporting live activity failed:", expect.any(TypeError));
    expect(snapshots()).toHaveLength(1);
  });

  it("logs a fetch that throws synchronously and still hands over the snapshot", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url === LIVE_ACTIVITY_ROUTE) throw new TypeError("keepalive body too large");
      return Promise.resolve(new Response(null, { status: 204 }));
    });

    await sendAndSettle();

    expect(log.warn).toHaveBeenCalledWith("Reporting live activity failed:", expect.any(TypeError));
    expect(snapshots()).toHaveLength(1);
  });
});

describe("presence: stopping the listener", () => {
  it("forgets who was listed and says it is no longer listening", () => {
    presenceService.listening = true;
    presenceService.listeningTo = "web-dev";
    presenceService.studentEventMap.set("alice", {} as never);

    presenceService.stopPresenceListener();

    expect(presenceService.listening).toBe(false);
    expect(presenceService.listeningTo).toBe("");
    expect(presenceService.studentEventMap.size).toBe(0);
  });
});
