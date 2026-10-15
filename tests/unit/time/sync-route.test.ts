import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ token: "test-only-sync-token" as string | undefined, sync: vi.fn() }));
vi.mock("$app/env/private", () => ({ get PRIVATE_MOODLE_SYNC_TOKEN() { return state.token; } }));
vi.mock("../../../apps/time/src/lib/server/services/AssignmentsSyncService.ts", () => ({
  AssignmentsSyncService: class { sync = state.sync; }
}));

import { POST } from "../../../apps/time/src/routes/api/sync/+server.ts";

function call(authorization?: string, body: unknown = { courseId: "web-dev-101", moodleCourseId: 42 }) {
  const request = new Request("https://time.test/api/sync", {
    method: "POST",
    headers: authorization ? { authorization, "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return POST({ request } as Parameters<typeof POST>[0]);
}

beforeEach(() => {
  state.token = "test-only-sync-token";
  state.sync.mockReset().mockResolvedValue(undefined);
});

describe("operator-only Moodle sync", () => {
  it("refuses missing, wrong and same-length incorrect bearer tokens before reaching Moodle or Supabase", async () => {
    for (const token of [undefined, "Bearer wrong", "Bearer test-only-sync-tokem"]) {
      await expect(call(token)).rejects.toMatchObject({ status: 401 });
    }
    expect(state.sync).not.toHaveBeenCalled();
  });

  it("fails closed when the operator token is not configured", async () => {
    state.token = undefined;
    await expect(call()).rejects.toMatchObject({ status: 503 });
    expect(state.sync).not.toHaveBeenCalled();
  });

  it.each([null, [], "text", { courseId: "../victim", moodleCourseId: 42 }, { courseId: "web-dev-101", moodleCourseId: 0 }, { courseId: "web-dev-101", moodleCourseId: 42, moodleSectionId: -1 }])("rejects an invalid body before syncing: %j", async (body) => {
    await expect(call("Bearer test-only-sync-token", body)).rejects.toMatchObject({ status: 400 });
    expect(state.sync).not.toHaveBeenCalled();
  });

  it("syncs a valid operator request with its course and optional section", async () => {
    const response = await call("Bearer test-only-sync-token", { courseId: " web-dev-101 ", moodleCourseId: 42, moodleSectionId: 7 });
    expect(await response.json()).toEqual({ ok: true });
    expect(state.sync).toHaveBeenCalledExactlyOnceWith("web-dev-101", 42, 7);
  });

  it("preserves sync failures instead of reporting success", async () => {
    state.sync.mockRejectedValue(new Error("Moodle unavailable"));
    await expect(call("Bearer test-only-sync-token")).rejects.toThrow("Moodle unavailable");
  });
});
