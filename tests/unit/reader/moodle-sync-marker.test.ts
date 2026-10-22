/**
 * Issue #524: the Moodle sync records its completion only after every write succeeded, and a failure
 * leaves the previous completion in place (Rules 0651-0652). Moodle is replaced at the assignments
 * service and the database by the recorder; the sync service and the repository are product code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/env/private", () => ({ SYNC_INTERVAL_MINUTES: "60" }));
vi.mock("../../../apps/reader/src/lib/server/supabase-service.ts", async () => {
  const { recorder } = await import("../../bdd/support/supabase-recorder.ts");
  return { serviceSupabase: () => recorder };
});
const moodle = vi.hoisted(() => ({ fetchAssignments: vi.fn(), fetchSubmissions: vi.fn() }));
vi.mock("../../../apps/reader/src/lib/server/moodle/assignments-service.ts", () => ({
  AssignmentsService: class {
    fetchAssignments = moodle.fetchAssignments;
    fetchSubmissions = moodle.fetchSubmissions;
  }
}));

import { AssignmentsSyncService } from "../../../apps/reader/src/lib/server/moodle/assignments-sync-service.ts";
import { recorder } from "../../bdd/support/supabase-recorder.ts";

const lab = { id: 7, instance: 11, name: "Lab report", modname: "assign" };
const submissions = { assignments: [{ assignmentid: 11, submissions: [{ id: 901, userid: 42, status: "submitted" }] }], warnings: [] };
const earlier = { courseid: "pf1", scope: "1234", synced_at: "2026-10-19T07:00:00.000Z" };

beforeEach(() => {
  recorder.reset();
  vi.stubEnv("HARNESS_NOW", "2026-10-19T09:00:00Z");
  moodle.fetchAssignments.mockReset().mockResolvedValue([lab]);
  moodle.fetchSubmissions.mockReset().mockResolvedValue(submissions);
});
afterEach(() => vi.unstubAllEnvs());

describe("Moodle sync completion marker", () => {
  it("records one completion, after the last submission is saved", async () => {
    await new AssignmentsSyncService().sync("pf1", 1234);

    const writes = recorder.tableCalls.filter((c) => c.op === "upsert").map((c) => c.table);
    expect(writes).toEqual(["assignments", "assignments_submissions", "moodle_syncs"]);
    expect(recorder.rows("moodle_syncs")).toEqual([{ courseid: "pf1", scope: "1234", synced_at: "2026-10-19T09:00:00.000Z" }]);
  });

  it("keeps the previous completion when fetching submissions fails after the assignments were saved", async () => {
    recorder.seed("moodle_syncs", [{ ...earlier }]);
    moodle.fetchSubmissions.mockRejectedValue(new Error("Moodle API error for mod_assign_get_submissions"));

    await expect(new AssignmentsSyncService().sync("pf1", 1234)).rejects.toThrow("mod_assign_get_submissions");
    expect(recorder.upserts("assignments")).toHaveLength(1);
    expect(recorder.rows("moodle_syncs")).toEqual([earlier]);
  });

  it("propagates a failure to record the completion", async () => {
    recorder.tableErrors.set("moodle_syncs", { message: "relation does not exist" });

    await expect(new AssignmentsSyncService().sync("pf1", 1234)).rejects.toThrow("Failed to record the Moodle sync of course pf1");
  });

  it("completes a sync of a Moodle course with no assignments without writing rows", async () => {
    moodle.fetchAssignments.mockResolvedValue([]);
    moodle.fetchSubmissions.mockResolvedValue({ assignments: [], warnings: [] });

    await new AssignmentsSyncService().sync("pf1", 1234);

    expect(recorder.upserts("assignments")).toEqual([]);
    expect(recorder.upserts("assignments_submissions")).toEqual([]);
    expect(recorder.rows("moodle_syncs")).toEqual([expect.objectContaining({ scope: "1234" })]);
  });

  it("records a section sync under its own scope", async () => {
    recorder.seed("moodle_syncs", [{ ...earlier, synced_at: "2026-10-19T08:30:00.000Z", scope: "1234/3" }]);

    await new AssignmentsSyncService().sync("pf1", 1234);

    expect(moodle.fetchAssignments).toHaveBeenCalledWith(1234, undefined);
    expect(recorder.rows("moodle_syncs").map((r) => r.scope)).toEqual(["1234/3", "1234"]);
  });
});
