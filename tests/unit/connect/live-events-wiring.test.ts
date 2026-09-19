import { describe, expect, it, vi } from "vitest";

/**
 * What the reader reports to Tutors Live.
 *
 * The behaviour that matters here is the one that separates live events from
 * analytics: they carry no identity, so they are emitted in anonymous mode too,
 * and an identifier only ever appears for someone who opted in.
 *
 * The emitter is a module singleton with one queue, so each test reads the
 * events its own calls added rather than resetting shared state.
 */

// The module only arms itself in a browser, and this tier runs in node. A bare
// stand-in is enough: nothing here touches the DOM, and a full DOM environment
// would cost the suite twenty seconds for one boolean.
vi.hoisted(() => {
  (globalThis as { document?: unknown }).document ??= {};
});

vi.mock("$env/dynamic/public", () => ({ env: { PUBLIC_LIVE_EVENTS_URL: "https://live.example/api/live/events" } }));

import {
  liveEmitter,
  optInToLiveEvents,
  optOutOfLiveEvents,
  reportCourseOpened,
  reportLoViewed,
  reportServiceUsed
} from "../../../packages/svelte/connect/src/services/live-events.ts";

/** The events `act` added to the queue. */
function emittedBy(act: () => void) {
  const before = liveEmitter.pending().length;
  act();
  return liveEmitter.pending().slice(before);
}

describe("reader live events", () => {
  it("is enabled once an endpoint is configured", () => {
    expect(liveEmitter.enabled).toBe(true);
  });

  it("opens a session on the first course, carrying the rotating token and no identity", () => {
    const emitted = emittedBy(() => reportCourseOpened("cs101"));

    expect(emitted.map((event) => event.type)).toEqual(["session.started", "course.opened"]);
    expect(emitted.every((event) => event.sid === liveEmitter.sid)).toBe(true);
    expect(emitted[0]).not.toHaveProperty("uid");
  });

  it("does not open a second session while the first is still going", () => {
    const emitted = emittedBy(() => reportCourseOpened("cs101"));
    expect(emitted.map((event) => event.type)).toEqual(["course.opened"]);
  });

  it("reports a view and the service its type implies", () => {
    const emitted = emittedBy(() => reportLoViewed("cs101", "/topic/1/lab-1", "lab"));

    expect(emitted.map((event) => event.type)).toEqual(["lo.viewed", "service.used"]);
    expect(emitted.at(-1)).toMatchObject({ service: "lab", course: "cs101" });
  });

  it("reports a view whose type has no service without inventing one", () => {
    const emitted = emittedBy(() => reportLoViewed("cs101", "/topic/1", "topic"));
    expect(emitted.map((event) => event.type)).toEqual(["lo.viewed"]);
  });

  it("ignores a report with no course or no route rather than emitting a half-formed event", () => {
    const emitted = emittedBy(() => {
      reportLoViewed("", "/topic/1", "lab");
      reportLoViewed("cs101", "", "lab");
    });
    expect(emitted).toEqual([]);
  });

  it("reports a service used on its own, for the ones no learning object implies", () => {
    const emitted = emittedBy(() => reportServiceUsed("cs101", "search"));
    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ type: "service.used", service: "search" });
  });

  it("stamps a hashed identifier on the next session once a learner opts in, and drops it on opt-out", async () => {
    await optInToLiveEvents("aoife");
    const optedIn = emittedBy(() => {
      liveEmitter.sessionEnded("cs101");
      reportCourseOpened("cs101");
    });

    const started = optedIn.find((event) => event.type === "session.started") as { uid?: string } | undefined;
    expect(started?.uid).toMatch(/^[0-9a-f]{32}$/);
    expect(started?.uid).not.toContain("aoife");

    optOutOfLiveEvents();
    const optedOut = emittedBy(() => {
      liveEmitter.sessionEnded("cs101");
      reportCourseOpened("cs101");
    });
    expect(optedOut.find((event) => event.type === "session.started")).not.toHaveProperty("uid");
  });
});
