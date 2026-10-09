import { describe, expect, it, vi } from "vitest";

vi.mock("$env/dynamic/private", () => ({ env: { PRIVATE_MOODLE_SYNC_TOKEN: "test-only-sync-token" } }));
vi.mock("$lib/server/services/AssignmentsSyncService", () => ({
  AssignmentsSyncService: class { sync() { throw new Error("sync must not run for invalid requests"); } }
}));

import { POST } from "../../../apps/time/src/routes/api/sync/+server.ts";

function call(authorization?: string, courseId = "web-dev-101") {
  const request = new Request("https://time.test/api/sync", {
    method: "POST",
    headers: authorization ? { authorization, "content-type": "application/json" } : { "content-type": "application/json" },
    body: JSON.stringify({ courseId, moodleCourseId: 42 })
  });
  return POST({ request } as Parameters<typeof POST>[0]);
}

describe("operator-only Moodle sync", () => {
  it("refuses missing and wrong bearer tokens before reaching Moodle or Supabase", async () => {
    await expect(call()).rejects.toMatchObject({ status: 401 });
    await expect(call("Bearer wrong")).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a malformed course id even with the operator token", async () => {
    await expect(call("Bearer test-only-sync-token", "../victim")).rejects.toMatchObject({ status: 400 });
  });
});
