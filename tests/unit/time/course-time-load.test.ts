/**
 * CourseTime, the time app's per-course read model, over a scripted Supabase client: what it
 * asks the database for, how it turns 30-second blocks into minutes and attaches learners' names,
 * and how a failed read is reported.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scriptedSupabase } from "../../support/scripted-supabase.ts";

const supabase = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../packages/jsr/time/src/services/supabase.ts", () => ({ getSupabase: () => supabase.current, initSupabase: vi.fn() }));

import { CourseTime } from "../../../packages/jsr/time/src/services/course-time.ts";

const entry = (studentid: string, id: string, timeactive: number) => ({ id, courseid: "cs101", studentid, timeactive, pageloads: 1 });
const record = (student_id: string, lo_id: string, duration: number | null) => ({ course_id: "cs101", student_id, lo_id, type: "lab", duration, date_last_accessed: "2026-01-05" });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ properties: { ignorepin: "4321" } }) }));
});
afterEach(() => vi.unstubAllGlobals());

describe("calendar data", () => {
  it("reads a course's calendar in id order, converts blocks to minutes and attaches full names", async () => {
    const { client, calls } = scriptedSupabase({
      calendar: [{ data: [entry("ann", "2026-01-05", 4), entry("bob", "2026-01-05", null as never)] }],
      "tutors-connect-users": [{ data: [{ github_id: "ann", full_name: "Ann A" }, { github_id: "bob", full_name: "  " }] }]
    });
    supabase.current = client;
    const entries = await CourseTime.getCalendarData("cs101");
    expect(entries.map((e) => [e.studentid, e.full_name, e.timeactive])).toEqual([
      ["ann", "Ann A", 2],
      ["bob", "bob", 0]
    ]);
    expect(calls.filter((c) => c.table === "calendar").map((c) => c.op)).toEqual(["select", "order", "eq"]);
    expect(calls.find((c) => c.op === "in")?.args).toEqual(["github_id", ["ann", "bob"]]);
  });

  it("reads every course when none is named, and uses the student id as the name when the lookup fails or finds nobody", async () => {
    const { client, calls } = scriptedSupabase({
      calendar: [{ data: [entry("ann", "2026-01-05", 2)] }, { data: [] }],
      "tutors-connect-users": [{ data: null, error: { message: "down" } }]
    });
    supabase.current = client;
    expect((await CourseTime.getCalendarData()).map((e) => e.full_name)).toEqual(["ann"]);
    expect(calls.filter((c) => c.table === "calendar").map((c) => c.op)).toEqual(["select", "order"]);
    expect(await CourseTime.getCalendarData("cs101")).toEqual([]);
  });

  it("reports a failed calendar read", async () => {
    supabase.current = scriptedSupabase({ calendar: [{ data: null, error: { message: "down" } }] }).client;
    await expect(CourseTime.getCalendarData("cs101")).rejects.toThrow("Failed to fetch calendar data: down");
  });
});

describe("learning records", () => {
  it("reads one learner's records of a type, and none on a failed read", async () => {
    const { client, calls } = scriptedSupabase({ learning_records: [{ data: [record("ann", "/lab/1", 2)] }, { data: null, error: { message: "down" } }] });
    supabase.current = client;
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    expect(await CourseTime.getLearningRecords("ann", "cs101", "lab")).toEqual([record("ann", "/lab/1", 2)]);
    expect(calls.map((c) => [c.op, ...c.args])).toEqual([
      ["select", "*"],
      ["eq", "student_id", "ann"],
      ["eq", "course_id", "cs101"],
      ["eq", "type", "lab"]
    ]);
    expect(await CourseTime.getLearningRecords("ann", "cs101", "lab")).toEqual([]);
    expect(stderr).toHaveBeenCalledWith("Failed to fetch learning records: down\n");
    stderr.mockRestore();
  });

  it("reads a course's records, converts durations to minutes and orders by learner then learning object", async () => {
    const { client } = scriptedSupabase({
      learning_records: [{ data: [record("bob", "/lab/2", 4), record("ann", "/lab/2", null), record("bob", "/lab/1", 2), record("ann", "/lab/1", 6)] }]
    });
    supabase.current = client;
    const records = await CourseTime.getAllLearningRecordsForCourse("cs101");
    expect(records.map((r) => [r.student_id, r.lo_id, r.duration])).toEqual([
      ["ann", "/lab/1", 3],
      ["ann", "/lab/2", null],
      ["bob", "/lab/1", 1],
      ["bob", "/lab/2", 2]
    ]);
  });

  it("reports a failed records read", async () => {
    supabase.current = scriptedSupabase({ learning_records: [{ data: null, error: { message: "down" } }] }).client;
    await expect(CourseTime.getAllLearningRecordsForCourse("cs101")).rejects.toThrow("Failed to fetch learning records: down");
  });
});

describe("loadTime", () => {
  it("loads a course's calendar within the dates, its learning records, its models and its pin", async () => {
    const { client } = scriptedSupabase({
      calendar: [{ data: [entry("ann", "2026-01-05", 2), entry("ann", "2026-02-05", 2)] }],
      "tutors-connect-users": [{ data: [{ github_id: "ann", full_name: "Ann A" }] }],
      learning_records: [{ data: [record("ann", "/lab/1", 2)] }]
    });
    supabase.current = client;
    const course = await new CourseTime().loadTime(" cs101 ", "2026-01-01", "2026-01-31", "CS101");
    expect(course.id).toBe("cs101");
    expect(course.title).toBe("CS101");
    expect(course.data.map((e) => e.id)).toEqual(["2026-01-05"]);
    expect(course.learningRecords).toHaveLength(1);
    expect(course.learningRecordsError).toBeNull();
    expect(course.error).toBeNull();
    expect(course.pin).toBe("4321");
    expect(course.calendarModel).toBeDefined();
    expect(course.labsModel).toBeDefined();
  });

  it("keeps the calendar when only the learning records fail, and needs a course id", async () => {
    const { client } = scriptedSupabase({
      calendar: [{ data: [entry("ann", "2026-01-05", 2)] }],
      "tutors-connect-users": [{ data: [] }],
      learning_records: [{ data: null, error: { message: "down" } }]
    });
    supabase.current = client;
    const course = await new CourseTime().loadTime("cs101", null, null, "CS101");
    expect(course.data).toHaveLength(1);
    expect(course.learningRecords).toEqual([]);
    expect(course.learningRecordsError).toBe("Failed to fetch learning records: down");
    await expect(new CourseTime().loadTime("  ", null, null, "CS101")).rejects.toThrow("Course ID is required");
  });

  it("reports a failed calendar read as a failed load", async () => {
    supabase.current = scriptedSupabase({ calendar: [{ data: null, error: { message: "down" } }] }).client;
    await expect(new CourseTime().loadTime("cs101", null, null, "CS101")).rejects.toThrow("Failed to load calendar data");
  });
});
