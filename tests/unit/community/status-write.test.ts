import { afterEach, expect, it, vi } from "vitest";

vi.mock("$app/env/public", () => ({ PUBLIC_ANON_MODE: "", PUBLIC_SUPABASE_URL: "", PUBLIC_SUPABASE_ANON_KEY: "" }));
import { updateTutorsConnectUserOnlineStatus } from "../../../packages/svelte/community/src/utils/supabase-client.ts";

afterEach(() => vi.unstubAllGlobals());

it.each([200, 401])("does not reject an online-status update on HTTP %s", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status })));
  await expect(updateTutorsConnectUserOnlineStatus("student", "online")).resolves.toBeUndefined();
});

it("reports a failed online-status save to its caller", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  await expect(updateTutorsConnectUserOnlineStatus("student", "online")).rejects.toThrow("Saving the online status failed with status 503");
});

it("tolerates an offline transport without throwing", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  await expect(updateTutorsConnectUserOnlineStatus("student", "offline")).resolves.toBeUndefined();
});
