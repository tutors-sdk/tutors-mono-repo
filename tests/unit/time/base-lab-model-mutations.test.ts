import { describe, it, expect } from "vitest";
import { BaseLabModel } from "../../../packages/jsr/time/src/services/base-lab-model.ts";
import type { LearningRecord } from "../../../packages/jsr/time/src/types/lab-types.ts";

const NO_DATE = "__no_date__";

function r(overrides: Partial<LearningRecord> & Record<string, unknown> = {}): LearningRecord {
  return {
    course_id: "course-1",
    student_id: "s1",
    full_name: "Student One",
    lo_id: "t/book-a/step-1",
    duration: 10,
    count: 1,
    date_last_accessed: "2024-03-01T10:00:00Z",
    type: "lab",
    ...overrides,
  } as LearningRecord;
}

describe("BaseLabModel.buildLabRowByDay", () => {
  it("does not count undated records, even when the no-date key is requested", () => {
    const row = BaseLabModel.buildLabRowByDay([r({ date_last_accessed: null, duration: 25 })], "s1", [NO_DATE], "One");
    expect(row).toEqual({ studentid: "s1", full_name: "One", totalMinutes: 0, [NO_DATE]: 0 });
  });
  it("treats a null date as undated rather than as the epoch", () => {
    const row = BaseLabModel.buildLabRowByDay([r({ date_last_accessed: null, duration: 25 })], "s1", ["1970-01-01"], "One");
    expect(row?.["1970-01-01"]).toBe(0);
    expect(row?.totalMinutes).toBe(0);
  });
});

describe("BaseLabModel.buildMedianByDay", () => {
  it("ignores records without a lo_id", () => {
    const row = BaseLabModel.buildMedianByDay(
      [r({ student_id: "ghost", lo_id: null, duration: 50 }), r({ student_id: "s2", duration: 10 })],
      "course-1",
      ["2024-03-01"],
    );
    expect(row).toEqual({ courseid: "course-1", totalMinutes: 10, "2024-03-01": 10 });
  });
  it("returns 0 (not NaN) for a date nobody worked on", () => {
    const row = BaseLabModel.buildMedianByDay([r()], "course-1", ["2030-01-01"]);
    expect(row?.["2030-01-01"]).toBe(0);
    expect(row?.totalMinutes).toBe(0);
  });
  it("buckets a date that cannot be converted under the no-date key", () => {
    // A Symbol makes the Date constructor throw, exercising the defensive catch.
    const row = BaseLabModel.buildMedianByDay([r({ date_last_accessed: Symbol("bad") as unknown as string, duration: 7 })], "c", [NO_DATE]);
    expect(row?.[NO_DATE]).toBe(7);
  });
});

describe("BaseLabModel constructor", () => {
  it("does not reorder the caller's records", () => {
    const records = [r({ lo_id: "t/book-b/s1" }), r({ lo_id: "t/book-a/s1" })];
    new BaseLabModel(records, null);
    expect(records.map((x) => x.lo_id)).toEqual(["t/book-b/s1", "t/book-a/s1"]);
  });

  it("orders labs by lo_id and takes the course id from the first sorted record", () => {
    const model = new BaseLabModel(
      [r({ course_id: "c-b", lo_id: "t/book-b/s1" }), r({ course_id: "c-a", lo_id: "t/book-a/s1" })],
      null,
    );
    expect(model.labs).toEqual(["book-a", "book-b"]);
    expect(model.courseId).toBe("c-a");
    expect(model.medianByLab.row?.courseid).toBe("c-a");
    expect(model.medianByLabStep.row?.courseid).toBe("c-a");
  });

  it("drops records with a null or empty lo_id", () => {
    const model = new BaseLabModel(
      [r({ lo_id: "t/book-b/s1" }), r({ lo_id: null, student_id: "x" }), r({ lo_id: "", student_id: "y" }), r({ lo_id: "t/book-a/s1" })],
      null,
    );
    expect(model.steps).toEqual(["t/book-a/s1", "t/book-b/s1"]);
    expect(model.step.rows.map((row) => row.studentid)).toEqual(["s1"]);
  });

  it("recognises a lab segment regardless of surrounding spaces and case", () => {
    const model = new BaseLabModel([r({ lo_id: "t/ BOOK-x /s1" })], null);
    expect(model.labs).toEqual(["BOOK-x"]);
    expect(model.steps).toEqual(["t/ BOOK-x /s1"]);
  });

  it("sorts steps by code unit order", () => {
    const model = new BaseLabModel([r({ lo_id: "t/book-a/b" }), r({ lo_id: "t/book-a/B" })], null);
    expect(model.steps).toEqual(["t/book-a/B", "t/book-a/b"]);
  });

  it("orders rows by student id, not by lo_id", () => {
    const model = new BaseLabModel(
      [r({ student_id: "zed", lo_id: "t/book-a/s1" }), r({ student_id: "amy", lo_id: "t/book-b/s1" })],
      null,
    );
    expect(model.lab.rows.map((row) => row.studentid)).toEqual(["amy", "zed"]);
    expect(model.step.rows.map((row) => row.studentid)).toEqual(["amy", "zed"]);
  });

  it("keeps the first full name seen for a student and falls back to the id", () => {
    const model = new BaseLabModel(
      [
        r({ lo_id: "t/book-a/s2", full_name: "Second" }),
        r({ lo_id: "t/book-a/s1", full_name: "First" }),
        r({ student_id: "anon", full_name: undefined }),
      ],
      null,
    );
    const names = Object.fromEntries(model.step.rows.map((row) => [row.studentid, row.full_name]));
    expect(names).toEqual({ s1: "First", anon: "anon" });
  });

  it("computes step medians over students who did the step only", () => {
    const model = new BaseLabModel(
      [
        r({ student_id: "s1", lo_id: "t/book-a/1", duration: 10 }),
        r({ student_id: "s1", lo_id: "t/book-a/2", duration: 20 }),
        r({ student_id: "s2", lo_id: "t/book-a/1", duration: 30 }),
      ],
      null,
    );
    expect(model.medianByLabStep.row).toEqual({ courseid: "course-1", totalMinutes: 30, "t/book-a/1": 20, "t/book-a/2": 20 });
  });

  it("computes lab medians over students who did the lab only", () => {
    const model = new BaseLabModel(
      [
        r({ student_id: "s1", lo_id: "t/book-a/1", duration: 10 }),
        r({ student_id: "s1", lo_id: "t/book-b/1", duration: 20 }),
        r({ student_id: "s2", lo_id: "t/book-a/1", duration: 40 }),
      ],
      null,
    );
    expect(model.medianByLab.row).toEqual({ courseid: "course-1", totalMinutes: 35, "book-a": 25, "book-b": 20 });
  });
});
