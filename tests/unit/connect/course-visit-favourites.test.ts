/**
 * Favouriting, unfavouriting and forgetting a course visit go through the ProfilePort the reader
 * composed, for the learner signed in (or the anonymous learner).
 */
import "../../bdd/support/svelte-runes-shim.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env", () => ({ browser: false }));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

import { tutorsConnectService } from "../../../packages/adapters/driving/svelte-state/src/connect/services/connect.svelte.ts";
import { anonymousAdapters, configureAdapters } from "../../../packages/adapters/driving/svelte-state/src/adapters.ts";
import { FixedClock, InMemoryProfile } from "../../../packages/application/src/testing/index.ts";

const profile = new InMemoryProfile();

beforeEach(async () => {
  profile.visits.clear();
  configureAdapters(anonymousAdapters({ profile: { local: profile, signedIn: null }, clock: new FixedClock() }));
  await profile.saveCourseVisits("", [
    { id: "cs101", title: "CS101", lastVisit: "2026-01-05T09:00:00.000Z", credits: "5", visits: 1 },
    { id: "cs102", title: "CS102", lastVisit: "2026-01-04T09:00:00.000Z", credits: "5", visits: 2 }
  ]);
});

describe("tutorsConnectService course visits", () => {
  it("reads the learner's visits through the profile", async () => {
    expect((await tutorsConnectService.getCourseVisits()).map((v) => v.id)).toEqual(["cs101", "cs102"]);
  });

  it("marks and unmarks a favourite", async () => {
    await tutorsConnectService.favouriteCourse("cs102");
    expect((await profile.getCourseVisits("")).map((v) => [v.id, v.favourite ?? false])).toEqual([
      ["cs101", false],
      ["cs102", true]
    ]);
    await tutorsConnectService.unfavouriteCourse("cs102");
    expect((await profile.getCourseVisits("")).map((v) => v.favourite ?? false)).toEqual([false, false]);
  });

  it("forgets a visit", async () => {
    await tutorsConnectService.deleteCourseVisit("cs101");
    expect((await tutorsConnectService.getCourseVisits()).map((v) => v.id)).toEqual(["cs102"]);
  });
});
