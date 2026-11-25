/**
 * The store-supabase adapter's public reads over a scripted client (it writes nothing: a learner's
 * writes go through the data API): each function degrades to "nothing" without a client, passes the right table and filters, and turns a failed query into an
 * empty answer (or null where the caller must tell a failure from an empty course).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkSupabase,
  configureSupabase,
  getLocksForCourse,
  getRecentErrorCounts,
  getTutorsConnectLatestLosByCourseId,
  getTutorsConnectRecentLosByCourseId,
  supabaseLockReader
} from "@tutors/store-supabase";

import { scriptedSupabase } from "../../support/scripted-supabase.ts";

vi.mock("@tutors/logger", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const scriptedClient = scriptedSupabase;

afterEach(() => configureSupabase(undefined));

describe("without a client", () => {
  beforeEach(() => configureSupabase(undefined));

  it("every read is empty and the health check is skipped", async () => {
    expect(await getLocksForCourse("cs101")).toEqual([]);
    expect(await getTutorsConnectLatestLosByCourseId("cs101")).toEqual([]);
    expect(await getTutorsConnectRecentLosByCourseId("cs101", "2026-01-01")).toEqual([]);
    expect(await checkSupabase()).toEqual({ status: "skipped", latencyMs: 0, message: "anon mode" });
    expect(await getRecentErrorCounts()).toEqual([]);
  });
});

describe("content locks", () => {
  it("reads a course's locks as the domain's ContentLock, and gives none for a failed read", async () => {
    const row = { course_id: "cs101", lo_route: "/lab/1", locked: true, locked_by: "lecturer", locked_at: "2026-01-05T09:00:00.000Z" };
    const { client, ops } = scriptedClient({ tutors_content_locks: [{ data: [row, { ...row, lo_route: "/lab/2", locked_at: null }] }, { data: null, error: { message: "down" } }] });
    configureSupabase(client as never);
    expect(await getLocksForCourse("cs101")).toEqual([
      { courseId: "cs101", route: "/lab/1", locked: true, lockedBy: "lecturer", lockedAt: "2026-01-05T09:00:00.000Z" },
      { courseId: "cs101", route: "/lab/2", locked: true, lockedBy: "lecturer" }
    ]);
    expect(ops("tutors_content_locks")).toEqual(["select", "eq"]);
    expect(await getLocksForCourse("cs101")).toEqual([]);
    expect(await getLocksForCourse("")).toEqual([]);
  });

  it("is the reading half of the AccessStore the reader composes, and has no way to write", async () => {
    const { client } = scriptedClient({ tutors_content_locks: [{ data: [] }] });
    configureSupabase(client as never);
    const reader = supabaseLockReader();
    expect(await reader.locks("cs101")).toEqual([]);
    expect(Object.keys(reader)).toEqual(["locks"]);
  });
});

describe("latest presence rows", () => {
  it("reads a course's rows newest first, and nothing for a blank course or a failed read", async () => {
    const { client, calls } = scriptedClient({ "tutors-connect-latest": [{ data: [{ student_id: "ann" }] }, { data: null, error: { message: "down" } }] });
    configureSupabase(client as never);
    expect(await getTutorsConnectLatestLosByCourseId("cs101")).toEqual([{ student_id: "ann" }]);
    expect(calls.find((c) => c.op === "order")?.args).toEqual(["received_at", { ascending: false }]);
    expect(await getTutorsConnectLatestLosByCourseId("cs101")).toEqual([]);
    expect(await getTutorsConnectLatestLosByCourseId("  ")).toEqual([]);
  });

  it("reads the rows since an instant, and tells a failed read (null) from an empty course", async () => {
    const { client, calls } = scriptedClient({ "tutors-connect-latest": [{ data: [] }, { data: null, error: { message: "down" } }] });
    configureSupabase(client as never);
    expect(await getTutorsConnectRecentLosByCourseId("cs101", "2026-01-05T09:00:00.000Z")).toEqual([]);
    expect(calls.find((c) => c.op === "gte")?.args).toEqual(["received_at", "2026-01-05T09:00:00.000Z"]);
    expect(await getTutorsConnectRecentLosByCourseId("cs101", "2026-01-05T09:00:00.000Z")).toBeNull();
    expect(await getTutorsConnectRecentLosByCourseId("", "2026-01-05T09:00:00.000Z")).toEqual([]);
  });
});

describe("health", () => {
  it("reports ok with a latency, an error with its message, and a thrown failure", async () => {
    const { client } = scriptedClient({ "tutors-connect-courses": [{ error: null, count: 3 }, { error: { message: "down" } }] });
    configureSupabase(client as never);
    expect(await checkSupabase()).toMatchObject({ status: "ok" });
    expect(await checkSupabase()).toMatchObject({ status: "error", message: "down" });
    configureSupabase({ from: () => { throw new Error("boom"); } } as never);
    expect(await checkSupabase()).toMatchObject({ status: "error", message: "boom" });
  });

  it("reads the last hour's error counts, and none when the call fails or throws", async () => {
    const { client, calls } = scriptedClient({ "rpc:get_error_counts": [{ data: [{ app: "reader", level: "error", count: 2 }] }, { data: null, error: { message: "down" } }] });
    configureSupabase(client as never);
    expect(await getRecentErrorCounts()).toEqual([{ app: "reader", level: "error", count: 2 }]);
    expect(calls[0].args).toEqual([{ minutes_ago: 60 }]);
    expect(await getRecentErrorCounts()).toEqual([]);
    configureSupabase({ rpc: () => { throw new Error("boom"); } } as never);
    expect(await getRecentErrorCounts()).toEqual([]);
  });
});
