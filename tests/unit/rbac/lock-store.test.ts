import { afterEach, describe, it, expect, vi } from "vitest";

vi.mock("../../../packages/adapters/driving/svelte-state/src/index.svelte.ts", () => ({ rune: <T>(initial: T) => ({ value: initial }) }));
vi.mock("../../../packages/adapters/driving/ui-primitives/src/utils/toaster.ts", () => ({ toaster: { error: vi.fn() } }));

import { dataApiLockWriter } from "../../../packages/adapters/driven/data-api/src/index.ts";
import { composeReader } from "../../../apps/reader/src/lib/compose.ts";
import { reportLockChange } from "../../../packages/adapters/driving/ui-navigators/src/buttons/lock-change.ts";
import { toaster } from "../../../packages/adapters/driving/ui-primitives/src/utils/toaster.ts";

// The lock half of the AccessStore port the reader composes: the data API adapter.
const upsertLock = dataApiLockWriter().setLock;

// Issue #527: only a lock change the server confirms counts as saved.
describe("dataApiLockWriter.setLock", () => {
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

  // An anonymous reader composes no data API at all: its access store keeps nothing and never asks a server.
  it("reports anonymous mode as unavailable without asking a server", async () => {
    const asked = vi.fn();
    vi.stubGlobal("fetch", asked);
    const anonymous = composeReader({ PUBLIC_ANON_MODE: "TRUE" });

    expect(await anonymous.accessStore.setLock("cs101", "/topic/cs101/week-01", true)).toBe("unavailable");
    expect(asked).not.toHaveBeenCalled();
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
