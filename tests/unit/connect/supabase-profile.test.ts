import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The signed-in profile store: removing and unstarring a course, and a save the server refuses.
 */

const api = vi.hoisted(() => ({ getProfile: vi.fn(), saveProfile: vi.fn() }));
const who = vi.hoisted(() => ({ value: null as { login: string } | null }));
const logError = vi.hoisted(() => vi.fn());

vi.mock("../../../packages/svelte/data-api/src/index.ts", () => ({
  dataApi: api,
}));
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => ({
  tutorsId: who,
}));
vi.mock("@tutors/logger", () => ({ default: { error: logError } }));

import { supabaseProfile } from "../../../packages/svelte/connect/src/services/supabaseProfile.svelte.ts";

const visit = (id: string, favourite = false) => ({
  id,
  title: id,
  lastVisit: "2026-09-26T10:00:00Z",
  credits: "",
  visits: 1,
  favourite,
});

beforeEach(() => {
  vi.resetAllMocks();
  who.value = { login: "alice" };
  api.saveProfile.mockResolvedValue({ ok: true });
});

describe("supabaseProfile", () => {
  it("removes a course visit and saves the rest", async () => {
    api.getProfile.mockResolvedValue({
      courseVisits: [visit("a"), visit("b")],
    });
    await supabaseProfile.deleteCourseVisit("a");
    expect(api.saveProfile).toHaveBeenCalledWith({
      courseVisits: [visit("b")],
    });
  });

  it("unstars a starred course", async () => {
    api.getProfile.mockResolvedValue({ courseVisits: [visit("a", true)] });
    await supabaseProfile.unfavouriteCourse("a");
    expect(api.saveProfile).toHaveBeenCalledWith({
      courseVisits: [visit("a", false)],
    });
  });

  it("logs a save the server refuses", async () => {
    api.getProfile.mockResolvedValue({ courseVisits: [visit("a")] });
    api.saveProfile.mockResolvedValue({ ok: false, status: 500 });
    await supabaseProfile.favouriteCourse("a");
    expect(logError).toHaveBeenCalledWith("Failed to save profile:", {
      status: 500,
    });
  });
});
