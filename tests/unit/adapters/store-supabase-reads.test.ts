/**
 * The store-supabase adapter's reads and writes over a scripted client: each function degrades to
 * "nothing" without a client, passes the right table and filters, and turns a failed query into an
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
  removeLock,
  supabaseAccessStore,
  supabaseLearningRecords,
  upsertLock,
  upsertTutorsConnectLatestLo
} from "@tutors/store-supabase";

import { scriptedSupabase } from "../../support/scripted-supabase.ts";

vi.mock("@tutors/logger", () => ({ default: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

const scriptedClient = scriptedSupabase;

afterEach(() => configureSupabase(undefined));

describe("without a client", () => {
  beforeEach(() => configureSupabase(undefined));

  it("every read is empty, every write is a no-op, and the health check is skipped", async () => {
    const records = supabaseLearningRecords();
    expect(await records.calendarEntries("cs101")).toEqual([]);
    expect(await records.learningRecords("cs101")).toEqual([]);
    expect(await records.learners("cs101")).toEqual([]);
    expect(await getLocksForCourse("cs101")).toEqual([]);
    expect(await upsertLock("cs101", "/lab/1", true, "lecturer")).toBe(false);
    expect(await removeLock("cs101", "/lab/1")).toBe(false);
    expect(await getTutorsConnectLatestLosByCourseId("cs101")).toEqual([]);
    expect(await getTutorsConnectRecentLosByCourseId("cs101", "2026-01-01")).toEqual([]);
    await upsertTutorsConnectLatestLo({ courseId: "cs101", user: { id: "ann" } });
    expect(await checkSupabase()).toEqual({ status: "skipped", latencyMs: 0, message: "anon mode" });
    expect(await getRecentErrorCounts()).toEqual([]);
  });
});

describe("learning records", () => {
  it("filters the calendar by course and inclusive day range", async () => {
    const { client, calls } = scriptedClient({ calendar: [{ data: [{ id: "2026-01-05" }] }] });
    configureSupabase(client as never);
    expect(await supabaseLearningRecords().calendarEntries("cs101", "2026-01-01", "2026-01-31")).toEqual([{ id: "2026-01-05" }]);
    expect(calls.map((c) => [c.op, ...c.args])).toEqual([
      ["select", "*"],
      ["eq", "courseid", "cs101"],
      ["gte", "id", "2026-01-01"],
      ["lte", "id", "2026-01-31"]
    ]);
  });

  it("reads one learner's records when asked, and nothing for no course or a failed query", async () => {
    const { client, calls } = scriptedClient({ learning_records: [{ data: [{ student_id: "bob" }] }, { data: null, error: { message: "down" } }] });
    configureSupabase(client as never);
    const records = supabaseLearningRecords();
    expect(await records.learningRecords("cs101", "bob")).toEqual([{ student_id: "bob" }]);
    expect(calls.map((c) => c.op)).toEqual(["select", "eq", "eq"]);
    expect(await records.learningRecords("cs101")).toEqual([]);
    expect(await records.learningRecords("")).toEqual([]);
    expect(await records.calendarEntries("")).toEqual([]);
  });

  it("lists the learners with records in the course, once each, and nobody for an empty course", async () => {
    const { client, calls } = scriptedClient({
      learning_records: [{ data: [{ student_id: "ann" }, { student_id: "ann" }, { student_id: "bob" }] }, { data: [] }],
      "tutors-connect-users": [{ data: [{ github_id: "ann" }, { github_id: "bob" }] }]
    });
    configureSupabase(client as never);
    const records = supabaseLearningRecords();
    expect(await records.learners("cs101")).toEqual([{ github_id: "ann" }, { github_id: "bob" }]);
    expect(calls.find((c) => c.op === "in")?.args).toEqual(["github_id", ["ann", "bob"]]);
    expect(await records.learners("cs101")).toEqual([]);
  });

  it("answers nobody when the users read fails", async () => {
    const { client } = scriptedClient({
      learning_records: [{ data: [{ student_id: "ann" }] }],
      "tutors-connect-users": [{ data: null, error: { message: "down" } }]
    });
    configureSupabase(client as never);
    expect(await supabaseLearningRecords().learners("cs101")).toEqual([]);
  });
});

describe("content locks", () => {
  it("reads a course's locks and gives none for a failed read", async () => {
    const { client, ops } = scriptedClient({ tutors_content_locks: [{ data: [{ lo_route: "/lab/1", locked: true }] }, { data: null, error: { message: "down" } }] });
    configureSupabase(client as never);
    expect(await getLocksForCourse("cs101")).toEqual([{ lo_route: "/lab/1", locked: true }]);
    expect(ops("tutors_content_locks")).toEqual(["select", "eq"]);
    expect(await getLocksForCourse("cs101")).toEqual([]);
    expect(await getLocksForCourse("")).toEqual([]);
  });

  it("upserts a lock keyed by course and route, and reports a failed write", async () => {
    const { client, calls } = scriptedClient({ tutors_content_locks: [{ error: null }, { error: { message: "down" } }] });
    configureSupabase(client as never);
    expect(await upsertLock("cs101", "/lab/1", true, "lecturer")).toBe(true);
    const upsert = calls.find((c) => c.op === "upsert")!;
    expect(upsert.args[0]).toMatchObject({ course_id: "cs101", lo_route: "/lab/1", locked: true, locked_by: "lecturer" });
    expect(upsert.args[1]).toEqual({ onConflict: "course_id,lo_route" });
    expect(await upsertLock("cs101", "/lab/1", true, "lecturer")).toBe(false);
    expect(await upsertLock("cs101", "/lab/1", true, "")).toBe(false);
  });

  it("removes a lock by course and route, and reports a failed delete", async () => {
    const { client, ops } = scriptedClient({ tutors_content_locks: [{ error: null }, { error: { message: "down" } }] });
    configureSupabase(client as never);
    expect(await removeLock("cs101", "/lab/1")).toBe(true);
    expect(ops("tutors_content_locks")).toEqual(["delete", "eq", "eq"]);
    expect(await removeLock("cs101", "/lab/1")).toBe(false);
    expect(await removeLock("cs101", "")).toBe(false);
  });

  it("is the AccessStore the application composes", async () => {
    const { client } = scriptedClient({ tutors_content_locks: [{ data: [] }] });
    configureSupabase(client as never);
    const store = supabaseAccessStore();
    expect(await store.locks("cs101")).toEqual([]);
    expect(store.setLock).toBe(upsertLock);
    expect(store.removeLock).toBe(removeLock);
  });
});

describe("latest presence rows", () => {
  it("upserts the latest snapshot per course and student and ignores an incomplete one", async () => {
    const { client, calls } = scriptedClient({ "tutors-connect-latest": [{ error: null }, { error: { message: "down" } }] });
    configureSupabase(client as never);
    await upsertTutorsConnectLatestLo({ courseId: " cs101 ", user: { id: "ann" } });
    const upsert = calls.find((c) => c.op === "upsert")!;
    expect(upsert.args[0]).toMatchObject({ course_id: "cs101", student_id: "ann" });
    expect(upsert.args[1]).toEqual({ onConflict: "course_id,student_id" });
    await upsertTutorsConnectLatestLo({ courseId: "cs101", user: { id: "bob" } });
    await upsertTutorsConnectLatestLo({ courseId: "cs101" });
    expect(calls.filter((c) => c.op === "upsert")).toHaveLength(2);
  });

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
