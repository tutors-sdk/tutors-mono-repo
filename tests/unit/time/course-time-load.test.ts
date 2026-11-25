/**
 * CourseTime, the time app's per-course read model, over the Supabase time source and a scripted
 * Supabase client: what one load asks the database for, how it turns 30-second blocks into minutes
 * and attaches learners' names, and how a failed read is reported.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addTransport, removeTransport, type LogEntry } from "../../../packages/platform/logger-core/src/index.ts";
import { scriptedSupabase } from "../../support/scripted-supabase.ts";

const supabase = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../packages/jsr/time/src/services/supabase.ts", () => ({ getSupabase: () => supabase.current, initSupabase: vi.fn() }));

import { CourseTime } from "../../../packages/jsr/time/src/services/course-time.ts";
import { setTutorsTimeSource, supabaseTimeSource } from "../../../packages/jsr/time/src/services/source.ts";

const entry = (studentid: string, id: string, timeactive: number) => ({ id, courseid: "cs101", studentid, timeactive, pageloads: 1 });
const record = (student_id: string, lo_id: string, duration: number | null) => ({ course_id: "cs101", student_id, lo_id, type: "lab", duration, date_last_accessed: "2026-01-05" });

beforeEach(() => {
  setTutorsTimeSource(supabaseTimeSource());
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ properties: { ignorepin: "4321" } }) }));
});
afterEach(() => vi.unstubAllGlobals());

describe("calendar data", () => {
  it("reads a course's calendar in id order, a page at a time, converts blocks to minutes and attaches full names", async () => {
    const { client, calls } = scriptedSupabase({
      calendar: [{ data: [entry("bob", "2026-01-06", null as never), entry("ann", "2026-01-05", 4)] }],
      "tutors-connect-users": [{ data: [{ github_id: "ann", full_name: "Ann A" }, { github_id: "bob", full_name: "  " }] }]
    });
    supabase.current = client;
    const entries = await CourseTime.getCalendarData("cs101", "2026-01-01", "2026-01-31");
    expect(entries.map((e) => [e.studentid, e.full_name, e.timeactive])).toEqual([
      ["ann", "Ann A", 2],
      ["bob", "bob", 0]
    ]);
    expect(calls.filter((c) => c.table === "calendar").map((c) => [c.op, ...c.args])).toEqual([
      ["select", "*"],
      ["eq", "courseid", "cs101"],
      ["order", "id", { ascending: true }],
      ["gte", "id", "2026-01-01"],
      ["lte", "id", "2026-01-31"],
      ["range", 0, 999]
    ]);
    expect(calls.find((c) => c.op === "in")?.args).toEqual(["github_id", ["bob", "ann"]]);
  });

  it("reads past the first thousand rows, and uses the student id as the name when the lookup finds nobody", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => entry("ann", `2026-01-05-${String(i).padStart(4, "0")}`, 2));
    const { client, calls } = scriptedSupabase({
      calendar: [{ data: page }, { data: [entry("ann", "2026-01-06", 2)] }],
      "tutors-connect-users": [{ data: null, error: { message: "down" } }]
    });
    supabase.current = client;
    const entries = await CourseTime.getCalendarData("cs101");
    expect(entries).toHaveLength(1001);
    expect(entries[0]!.full_name).toBe("ann");
    expect(calls.filter((c) => c.table === "calendar" && c.op === "range").map((c) => c.args)).toEqual([
      [0, 999],
      [1000, 1999]
    ]);
    expect(calls.filter((c) => c.table === "calendar").map((c) => c.op)).not.toContain("gte");
  });

  it("reports a failed calendar read", async () => {
    supabase.current = scriptedSupabase({ calendar: [{ data: null, error: { message: "down" } }] }).client;
    await expect(CourseTime.getCalendarData("cs101")).rejects.toThrow("Failed to fetch calendar data: down");
  });
});

describe("learning records", () => {
  it("picks one learner's records of a type out of the course's, and none on a failed read", async () => {
    const { client, calls } = scriptedSupabase({
      learning_records: [{ data: [record("ann", "/lab/1", 2), record("bob", "/lab/1", 2), { ...record("ann", "/talk/1", 2), type: "talk" }] }, { data: null, error: { message: "down" } }]
    });
    supabase.current = client;
    // The time library reports through the shared logger, so the app's transports see it (Rule 0291).
    const entries: LogEntry[] = [];
    const transport = (entry: LogEntry) => entries.push(entry);
    addTransport(transport);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await CourseTime.getLearningRecords("ann", "cs101", "lab")).toEqual([record("ann", "/lab/1", 2)]);
    expect(calls.filter((c) => c.table === "learning_records").map((c) => [c.op, ...c.args])).toEqual([
      ["select", "*"],
      ["eq", "course_id", "cs101"],
      ["order", "date_last_accessed", { ascending: false }],
      ["range", 0, 999]
    ]);
    expect(await CourseTime.getLearningRecords("ann", "cs101", "lab")).toEqual([]);
    removeTransport(transport);
    warn.mockRestore();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: "warn", message: "Failed to fetch learning records", error: "Failed to fetch learning records: down", courseId: "cs101", type: "lab" });
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

describe("the course record and a learner", () => {
  it("reads one course record and one learner without the email column, and null when there is none", async () => {
    const { client, calls } = scriptedSupabase({
      "tutors-connect-courses": [{ data: { course_id: "cs101", course_record: { title: "CS101" } } }, { data: null, error: { message: "down" } }],
      "tutors-connect-users": [{ data: { github_id: "ann", full_name: "Ann A" } }, { data: null }]
    });
    supabase.current = client;
    const source = supabaseTimeSource();
    expect(await source.courseRecord("cs101")).toEqual({ course_id: "cs101", course_record: { title: "CS101" } });
    expect(await source.courseRecord("cs101")).toBeNull();
    expect(await source.user("ann")).toEqual({ github_id: "ann", full_name: "Ann A" });
    expect(await source.user("nobody")).toBeNull();
    const columns = calls.find((c) => c.table === "tutors-connect-users" && c.op === "select")!.args[0] as string;
    expect(columns).toContain("github_id");
    expect(columns).not.toContain("email");
    expect(calls.filter((c) => c.op === "maybeSingle")).toHaveLength(4);
  });
});

describe("loadTime", () => {
  it("loads a course's calendar, its learning records, its models and its pin", async () => {
    const { client, calls } = scriptedSupabase({
      calendar: [{ data: [entry("ann", "2026-01-05", 2)] }],
      "tutors-connect-users": [{ data: [{ github_id: "ann", full_name: "Ann A" }] }],
      learning_records: [{ data: [record("ann", "/lab/1", 2)] }]
    });
    supabase.current = client;
    const course = await new CourseTime().loadTime(" cs101 ", "2026-01-01", "2026-01-31", "CS101");
    expect(course.id).toBe("cs101");
    expect(course.title).toBe("CS101");
    expect(course.data.map((e) => e.id)).toEqual(["2026-01-05"]);
    expect(calls.find((c) => c.op === "gte")?.args).toEqual(["id", "2026-01-01"]);
    expect(calls.find((c) => c.op === "lte")?.args).toEqual(["id", "2026-01-31"]);
    expect(course.learningRecords).toHaveLength(1);
    expect(course.learningRecordsError).toBeNull();
    expect(course.error).toBeNull();
    expect(course.pin).toBe("4321");
    expect(course.calendarModel).toBeDefined();
    expect(course.labsModel).toBeDefined();
  });

  it("needs a course id", async () => {
    await expect(new CourseTime().loadTime("  ", null, null, "CS101")).rejects.toThrow("Course ID is required");
  });

  it("reports a failed calendar or records read as a failed load", async () => {
    supabase.current = scriptedSupabase({ calendar: [{ data: null, error: { message: "down" } }] }).client;
    await expect(new CourseTime().loadTime("cs101", null, null, "CS101")).rejects.toThrow("Failed to load calendar data");
    supabase.current = scriptedSupabase({ calendar: [{ data: [entry("ann", "2026-01-05", 2)] }], learning_records: [{ data: null, error: { message: "down" } }] }).client;
    await expect(new CourseTime().loadTime("cs101", null, null, "CS101")).rejects.toThrow("Failed to load calendar data");
  });
});
