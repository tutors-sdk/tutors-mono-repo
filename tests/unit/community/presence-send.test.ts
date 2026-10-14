// @vitest-environment happy-dom
/**
 * Sharing a move: this browser's own online list moves before the PresencePort hears about it,
 * and a publish that fails is logged, so the local list never waits on Supabase.
 */
import "../../bdd/support/svelte-runes-shim.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: true }));

import log from "@tutors/logger";
import { presenceService } from "../../../packages/adapters/driving/svelte-state/src/community/services/presence.svelte.ts";
import { anonymousAdapters, configureAdapters } from "../../../packages/adapters/driving/svelte-state/src/adapters.ts";
import { FixedClock, InMemoryPresence } from "../../../packages/application/src/testing/index.ts";

const course = { courseId: "cs101", courseUrl: "https://cs101.example", title: "CS101", properties: {} } as any;
const lab = { type: "lab", title: "Lab 1", route: "/lab/cs101/lab-1", img: "" } as any;
const alice = { login: "alice", name: "Alice", email: "", image: "", share: "true", sentiment: "neutral" } as any;

beforeEach(() => {
  presenceService.studentsOnline.value = [];
  presenceService.studentEventMap.clear();
  presenceService.listeningTo = "cs101";
});

describe("presenceService.sendLoEvent", () => {
  it("moves this browser's own list before the port has published", () => {
    const presence = new InMemoryPresence();
    const slow = vi.spyOn(presence, "publish").mockReturnValue(new Promise(() => {}));
    configureAdapters({ ...anonymousAdapters({ presence, clock: new FixedClock() }), anonymous: false });

    presenceService.sendLoEvent(course, lab, alice);

    expect(slow).toHaveBeenCalledTimes(1);
    expect(presenceService.studentsOnline.value.map((record) => [record.user?.id, record.title])).toEqual([["alice", "Lab 1"]]);
  });

  it("logs a failed publish and keeps the local move", async () => {
    const presence = new InMemoryPresence();
    vi.spyOn(presence, "publish").mockRejectedValue(new Error("channel closed"));
    const warn = vi.spyOn(log, "warn").mockImplementation(() => {});
    configureAdapters({ ...anonymousAdapters({ presence, clock: new FixedClock() }), anonymous: false });

    presenceService.sendLoEvent(course, lab, alice);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Sharing presence failed"), expect.any(Error));
    expect(presenceService.studentsOnline.value).toHaveLength(1);
    warn.mockRestore();
  });

  it("does nothing in anonymous mode", () => {
    const presence = new InMemoryPresence();
    configureAdapters(anonymousAdapters({ presence }));

    presenceService.sendLoEvent(course, lab, alice);

    expect(presence.published).toEqual([]);
    expect(presenceService.studentsOnline.value).toEqual([]);
  });
});
