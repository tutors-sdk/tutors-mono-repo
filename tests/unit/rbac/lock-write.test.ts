import { afterEach, expect, it, vi } from "vitest";

vi.mock("$app/env/public", () => ({ PUBLIC_ANON_MODE: "" }));
vi.mock("@tutors/community/utils/supabase-client", () => ({ supabase: undefined }));
import { upsertLock } from "../../../packages/svelte/utils/rbac/src/lock-store.ts";

afterEach(() => vi.unstubAllGlobals());

it.each([[200, "saved"], [401, "refused"], [403, "refused"], [502, "refused"], [503, "unavailable"]])(
  "maps HTTP %s to %s so the UI can retain or roll back its local lock",
  async (status, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: Number(status) })));
    expect(await upsertLock("course", "/topic/course/topic-1", true)).toBe(expected);
  }
);

it("retains the local lock when the server cannot be reached", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  expect(await upsertLock("course", "/topic/course/topic-1", true)).toBe("unavailable");
});

it.each([["", "/topic/course/topic-1"], ["course", ""]])("refuses an incomplete lock target (%s, %s) without a request", async (courseId, route) => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect(await upsertLock(courseId, route, true)).toBe("refused");
  expect(fetch).not.toHaveBeenCalled();
});
