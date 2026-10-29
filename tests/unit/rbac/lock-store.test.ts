import { afterEach, describe, it, expect, vi } from "vitest";

vi.mock("@tutors/community/utils/supabase-client", () => ({ supabase: undefined }));
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => ({ rune: <T>(initial: T) => ({ value: initial }) }));
vi.mock("../../../packages/svelte/ui-primitives/src/utils/toaster.ts", () => ({ toaster: { error: vi.fn() } }));

import { upsertLock } from "../../../packages/svelte/utils/rbac/src/lock-store.ts";
import { reportLockChange } from "../../../packages/svelte/ui-navigators/src/buttons/lock-change.ts";
import { toaster } from "../../../packages/svelte/ui-primitives/src/utils/toaster.ts";

// Issue #527: only a lock change the server confirms counts as saved.
describe("upsertLock", () => {
  afterEach(() => vi.unstubAllGlobals());
  const answer = (response: () => Promise<Response>) => vi.stubGlobal("fetch", vi.fn(response));

  it.each([
    [200, "saved"],
    [401, "refused"],
    [403, "refused"],
    [502, "refused"],
    [500, "refused"],
    [503, "unavailable"]
  ])("reports HTTP %i as %s", async (status, result) => {
    answer(async () => new Response(null, { status }));
    expect(await upsertLock("cs101", "/topic/cs101/week-01", true)).toBe(result);
  });

  it.each([
    ["", "/topic/cs101/week-01"],
    ["cs101", ""]
  ])("refuses an incomplete lock target (%s, %s) without a request", async (courseId, loRoute) => {
    const asked = vi.fn();
    vi.stubGlobal("fetch", asked);
    expect(await upsertLock(courseId, loRoute, true)).toBe("refused");
    expect(asked).not.toHaveBeenCalled();
  });

  it("reports a network failure as unreachable, not as a reader without a database", async () => {
    answer(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await upsertLock("cs101", "/topic/cs101/week-01", true)).toBe("unreachable");
  });

  // The data API answers null in anonymous mode and when the network fails alike, so upsertLock
  // tells them apart itself: an anonymous reader has no server to save to, and never asks one.
  it("reports anonymous mode as unavailable without asking a server", async () => {
    vi.resetModules();
    vi.doMock("$app/env/public", () => ({ PUBLIC_ANON_MODE: "TRUE" }));
    const asked = vi.fn();
    vi.stubGlobal("fetch", asked);
    const { upsertLock: anonUpsertLock } = await import("../../../packages/svelte/utils/rbac/src/lock-store.ts");

    expect(await anonUpsertLock("cs101", "/topic/cs101/week-01", true)).toBe("unavailable");
    expect(asked).not.toHaveBeenCalled();

    vi.doUnmock("$app/env/public");
    vi.resetModules();
  });
});

describe("reportLockChange", () => {
  afterEach(() => vi.mocked(toaster.error).mockClear());

  it("tells the educator a change was not saved", async () => {
    expect(await reportLockChange(Promise.resolve("unsaved"))).toBe("unsaved");
    expect(toaster.error).toHaveBeenCalledWith({
      title: "Lock change not saved",
      description: "Students still see the previous setting. Check your connection and sign-in, then try again."
    });
  });

  it.each(["saved", "local"] as const)("shows no error toast for a %s change", async (result) => {
    expect(await reportLockChange(Promise.resolve(result))).toBe(result);
    expect(toaster.error).not.toHaveBeenCalled();
  });
});
