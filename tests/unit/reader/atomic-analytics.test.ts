import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordPageLoad, recordTick, recordingFunctions } from "../../../apps/reader/src/lib/server/api/store.ts";

beforeEach(() => { recordingFunctions.missing = false; });

describe("server analytics preserve main's atomic recording", () => {
  const input = { courseId: "course", loId: "lab/one", loType: "lab", day: "2026-10-15" };
  it.each([["record_page_view", recordPageLoad], ["record_heartbeat", recordTick]] as const)("uses %s with the verified login", async (name, record) => {
    const rpc = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn();
    await record({ rpc, from } as unknown as SupabaseClient, "alice", input);
    expect(rpc).toHaveBeenCalledExactlyOnceWith(name, {
      p_course_id: "course", p_student_id: "alice", p_lo_id: "lab/one", p_day: "2026-10-15",
      ...(name === "record_page_view" ? { p_lo_type: "lab" } : {})
    });
    expect(from).not.toHaveBeenCalled();
  });
  it("reports database failures without retrying the write through the legacy path", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { code: "42501", message: "permission denied" } });
    const from = vi.fn();
    await expect(recordPageLoad({ rpc, from } as unknown as SupabaseClient, "alice", input)).rejects.toThrow("permission denied");
    expect(from).not.toHaveBeenCalled();
    expect(recordingFunctions.missing).toBe(false);
  });
});
