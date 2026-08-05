import { describe, it, expect } from "vitest";
import { BaseLabModel } from "../../../packages/jsr/time/src/services/base-lab-model";
import type { LearningRecord } from "../../../packages/jsr/time/src/types/lab-types";

// ---------------------------------------------------------------------------
// Helper: build a minimal LearningRecord for lab tests
// ---------------------------------------------------------------------------
function makeLabRecord(overrides: Partial<LearningRecord> = {}): LearningRecord {
  return {
    course_id: "course-1",
    student_id: "student-1",
    full_name: "Student One",
    lo_id: "topic/book-lab1/step-01",
    duration: 10,
    count: 1,
    date_last_accessed: "2025-03-15T10:30:00Z",
    type: "lab",
    ...overrides
  };
}

// ===========================================================================
// Empty records
// ===========================================================================
describe("BaseLabModel with empty records", () => {
  it("produces empty tables and no labs/steps", () => {
    const model = new BaseLabModel([], null);
    expect(model.lab.rows).toEqual([]);
    expect(model.step.rows).toEqual([]);
    expect(model.medianByLab.row).toBeNull();
    expect(model.medianByLabStep.row).toBeNull();
    expect(model.labs).toEqual([]);
    expect(model.steps).toEqual([]);
    expect(model.courseId).toBe("");
  });
});

// ===========================================================================
// Error propagation
// ===========================================================================
describe("BaseLabModel error propagation", () => {
  it("passes through a non-null error string", () => {
    const model = new BaseLabModel([], "fetch failed");
    expect(model.error).toBe("fetch failed");
  });

  it("passes null error when no error", () => {
    const model = new BaseLabModel([makeLabRecord()], null);
    expect(model.error).toBeNull();
  });
});

// ===========================================================================
// Filtering: only records with a "book" segment are kept
// ===========================================================================
describe("BaseLabModel record filtering", () => {
  it("filters out records without a 'book' segment in lo_id", () => {
    const records = [
      makeLabRecord({ lo_id: "topic/talk-1/unit-01", student_id: "alice" }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "bob" })
    ];
    const model = new BaseLabModel(records, null);
    expect(model.lab.rows).toHaveLength(1);
    expect(model.lab.rows[0].studentid).toBe("bob");
  });

  it("filters out records with null lo_id", () => {
    const records = [
      makeLabRecord({ lo_id: null }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01" })
    ];
    const model = new BaseLabModel(records, null);
    expect(model.step.rows).toHaveLength(1);
  });

  it("keeps records where 'book' appears in any segment position", () => {
    const records = [
      makeLabRecord({ lo_id: "book-top/step-01" }),
      makeLabRecord({ lo_id: "topic/subtopic/book-deep/step-01", student_id: "s2" })
    ];
    const model = new BaseLabModel(records, null);
    // Both should pass the filter
    expect(model.step.rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ===========================================================================
// Single student, single lab, single step
// ===========================================================================
describe("BaseLabModel with single student single lab", () => {
  const record = makeLabRecord({
    lo_id: "topic/book-lab1/step-01",
    student_id: "alice",
    full_name: "Alice Smith",
    duration: 25
  });

  it("lab view aggregates by lab identifier", () => {
    const model = new BaseLabModel([record], null);
    expect(model.lab.rows).toHaveLength(1);
    const row = model.lab.rows[0];
    expect(row.studentid).toBe("alice");
    expect(row.full_name).toBe("Alice Smith");
    expect(row["book-lab1"]).toBe(25);
    expect(row.totalMinutes).toBe(25);
  });

  it("step view uses full lo_id as column key", () => {
    const model = new BaseLabModel([record], null);
    expect(model.step.rows).toHaveLength(1);
    const row = model.step.rows[0];
    expect(row["topic/book-lab1/step-01"]).toBe(25);
    expect(row.totalMinutes).toBe(25);
  });

  it("sets courseId from records", () => {
    const model = new BaseLabModel([record], null);
    expect(model.courseId).toBe("course-1");
  });

  it("labs and steps arrays are populated", () => {
    const model = new BaseLabModel([record], null);
    expect(model.labs).toEqual(["book-lab1"]);
    expect(model.steps).toEqual(["topic/book-lab1/step-01"]);
  });
});

// ===========================================================================
// Multiple students, multiple labs/steps
// ===========================================================================
describe("BaseLabModel with multiple students and labs", () => {
  const records = [
    makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "alice", full_name: "Alice", duration: 10 }),
    makeLabRecord({ lo_id: "topic/book-lab1/step-02", student_id: "alice", full_name: "Alice", duration: 20 }),
    makeLabRecord({ lo_id: "topic/book-lab2/step-01", student_id: "alice", full_name: "Alice", duration: 30 }),
    makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "bob", full_name: "Bob", duration: 15 }),
    makeLabRecord({ lo_id: "topic/book-lab2/step-01", student_id: "bob", full_name: "Bob", duration: 25 })
  ];

  it("lab view sums durations per lab per student", () => {
    const model = new BaseLabModel(records, null);
    expect(model.lab.rows).toHaveLength(2);
    const alice = model.lab.rows.find((r) => r.studentid === "alice")!;
    // Alice: book-lab1 = 10 + 20, book-lab2 = 30
    expect(alice["book-lab1"]).toBe(30);
    expect(alice["book-lab2"]).toBe(30);
    expect(alice.totalMinutes).toBe(60);

    const bob = model.lab.rows.find((r) => r.studentid === "bob")!;
    expect(bob["book-lab1"]).toBe(15);
    expect(bob["book-lab2"]).toBe(25);
    expect(bob.totalMinutes).toBe(40);
  });

  it("step view has one column per distinct lo_id", () => {
    const model = new BaseLabModel(records, null);
    expect(model.steps).toHaveLength(3);
    expect(model.steps).toContain("topic/book-lab1/step-01");
    expect(model.steps).toContain("topic/book-lab1/step-02");
    expect(model.steps).toContain("topic/book-lab2/step-01");
  });

  it("rows are sorted by studentid", () => {
    const model = new BaseLabModel(records, null);
    expect(model.lab.rows[0].studentid).toBe("alice");
    expect(model.lab.rows[1].studentid).toBe("bob");
  });
});

// ===========================================================================
// Median calculations
// ===========================================================================
describe("BaseLabModel median calculations", () => {
  it("medianByLab computes median per lab across students", () => {
    // alice: book-lab1 = 10, bob: book-lab1 = 30, carol: book-lab1 = 20
    // sorted: [10, 20, 30] -> median = 20
    const records = [
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "alice", duration: 10 }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "bob", duration: 30 }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "carol", duration: 20 })
    ];
    const model = new BaseLabModel(records, null);
    expect(model.medianByLab.row).not.toBeNull();
    expect(model.medianByLab.row!["book-lab1"]).toBe(20);
  });

  it("medianByLabStep computes median per step across students", () => {
    const records = [
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "alice", duration: 10 }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "bob", duration: 30 }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "carol", duration: 20 })
    ];
    const model = new BaseLabModel(records, null);
    expect(model.medianByLabStep.row).not.toBeNull();
    expect(model.medianByLabStep.row!["topic/book-lab1/step-01"]).toBe(20);
  });

  it("median of even count returns rounded average of two middles", () => {
    // 4 students: 10, 20, 30, 40 -> median = round((20+30)/2) = 25
    const records = [
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "a", duration: 10 }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "b", duration: 40 }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "c", duration: 20 }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "d", duration: 30 })
    ];
    const model = new BaseLabModel(records, null);
    expect(model.medianByLab.row!["book-lab1"]).toBe(25);
  });

  it("median totalMinutes is median of per-student totals", () => {
    // alice: 10+20=30, bob: 40, carol: 50
    // sorted totals: [30, 40, 50] -> median = 40
    const records = [
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "alice", duration: 10 }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-02", student_id: "alice", duration: 20 }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "bob", duration: 40 }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "carol", duration: 50 })
    ];
    const model = new BaseLabModel(records, null);
    expect(model.medianByLab.row!.totalMinutes).toBe(40);
  });

  it("medianByLab is null for empty records", () => {
    const model = new BaseLabModel([], null);
    expect(model.medianByLab.row).toBeNull();
  });

  it("medianByLabStep is null for empty records", () => {
    const model = new BaseLabModel([], null);
    expect(model.medianByLabStep.row).toBeNull();
  });
});

// ===========================================================================
// Duration edge cases
// ===========================================================================
describe("BaseLabModel duration edge cases", () => {
  it("treats null duration as 0", () => {
    const records = [
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "alice", duration: null }),
      makeLabRecord({ lo_id: "topic/book-lab1/step-01", student_id: "alice", duration: 10 })
    ];
    const model = new BaseLabModel(records, null);
    expect(model.lab.rows[0]["book-lab1"]).toBe(10);
    expect(model.lab.rows[0].totalMinutes).toBe(10);
  });
});

// ===========================================================================
// buildLabRowByDay (static)
// ===========================================================================
describe("BaseLabModel.buildLabRowByDay", () => {
  it("builds a row with per-date durations for a student", () => {
    const records = [
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-10T10:00:00Z", duration: 15 }),
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-11T14:00:00Z", duration: 25 })
    ];
    const dates = ["2025-03-10", "2025-03-11"];
    const row = BaseLabModel.buildLabRowByDay(records, "alice", dates, "Alice Smith");

    expect(row).not.toBeNull();
    expect(row!.studentid).toBe("alice");
    expect(row!.full_name).toBe("Alice Smith");
    expect(row!["2025-03-10"]).toBe(15);
    expect(row!["2025-03-11"]).toBe(25);
    expect(row!.totalMinutes).toBe(40);
  });

  it("sums durations for same student on same date", () => {
    const records = [
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-10T08:00:00Z", duration: 10 }),
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-10T16:00:00Z", duration: 20 })
    ];
    const dates = ["2025-03-10"];
    const row = BaseLabModel.buildLabRowByDay(records, "alice", dates, "Alice");

    expect(row!["2025-03-10"]).toBe(30);
    expect(row!.totalMinutes).toBe(30);
  });

  it("returns null when no records match the studentId", () => {
    const records = [
      makeLabRecord({ student_id: "bob", date_last_accessed: "2025-03-10T10:00:00Z" })
    ];
    const row = BaseLabModel.buildLabRowByDay(records, "alice", ["2025-03-10"], "Alice");
    expect(row).toBeNull();
  });

  it("returns null when dates array is empty", () => {
    const records = [
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-10T10:00:00Z" })
    ];
    const row = BaseLabModel.buildLabRowByDay(records, "alice", [], "Alice");
    expect(row).toBeNull();
  });

  it("returns null when records array is empty", () => {
    const row = BaseLabModel.buildLabRowByDay([], "alice", ["2025-03-10"], "Alice");
    expect(row).toBeNull();
  });

  it("ignores records with null lo_id", () => {
    const records = [
      makeLabRecord({ student_id: "alice", lo_id: null, date_last_accessed: "2025-03-10T10:00:00Z", duration: 50 }),
      makeLabRecord({ student_id: "alice", lo_id: "topic/book-1/step-1", date_last_accessed: "2025-03-10T10:00:00Z", duration: 5 })
    ];
    const row = BaseLabModel.buildLabRowByDay(records, "alice", ["2025-03-10"], "Alice");
    expect(row!["2025-03-10"]).toBe(5);
  });

  it("skips records without a parseable date (no_date)", () => {
    const records = [
      makeLabRecord({ student_id: "alice", date_last_accessed: null, duration: 100 }),
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-10T10:00:00Z", duration: 5 })
    ];
    const dates = ["2025-03-10"];
    const row = BaseLabModel.buildLabRowByDay(records, "alice", dates, "Alice");
    expect(row!["2025-03-10"]).toBe(5);
    expect(row!.totalMinutes).toBe(5);
  });

  it("sets 0 for dates with no matching records", () => {
    const records = [
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-10T10:00:00Z", duration: 15 })
    ];
    const dates = ["2025-03-10", "2025-03-11"];
    const row = BaseLabModel.buildLabRowByDay(records, "alice", dates, "Alice");
    expect(row!["2025-03-10"]).toBe(15);
    expect(row!["2025-03-11"]).toBe(0);
    expect(row!.totalMinutes).toBe(15);
  });
});

// ===========================================================================
// buildMedianByDay (static)
// ===========================================================================
describe("BaseLabModel.buildMedianByDay", () => {
  it("computes median duration per date across students", () => {
    // Date 2025-03-10: alice=10, bob=30, carol=20 -> median=20
    const records = [
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-10T10:00:00Z", duration: 10 }),
      makeLabRecord({ student_id: "bob", date_last_accessed: "2025-03-10T10:00:00Z", duration: 30 }),
      makeLabRecord({ student_id: "carol", date_last_accessed: "2025-03-10T10:00:00Z", duration: 20 })
    ];
    const dates = ["2025-03-10"];
    const row = BaseLabModel.buildMedianByDay(records, "course-1", dates);

    expect(row).not.toBeNull();
    expect(row!.courseid).toBe("course-1");
    expect(row!["2025-03-10"]).toBe(20);
  });

  it("computes totalMinutes as median of per-student totals", () => {
    // alice total=15, bob total=45, carol total=30 -> median=30
    const records = [
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-10T10:00:00Z", duration: 15 }),
      makeLabRecord({ student_id: "bob", date_last_accessed: "2025-03-10T10:00:00Z", duration: 45 }),
      makeLabRecord({ student_id: "carol", date_last_accessed: "2025-03-10T10:00:00Z", duration: 30 })
    ];
    const row = BaseLabModel.buildMedianByDay(records, "course-1", ["2025-03-10"]);
    expect(row!.totalMinutes).toBe(30);
  });

  it("returns null when records are empty", () => {
    const row = BaseLabModel.buildMedianByDay([], "course-1", ["2025-03-10"]);
    expect(row).toBeNull();
  });

  it("returns null when dates are empty", () => {
    const records = [makeLabRecord({ student_id: "alice" })];
    const row = BaseLabModel.buildMedianByDay(records, "course-1", []);
    expect(row).toBeNull();
  });

  it("excludes zero-duration entries from median per date", () => {
    // alice=10, bob=0 on same date -> only [10] contributes -> median=10
    const records = [
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-10T10:00:00Z", duration: 10 }),
      makeLabRecord({ student_id: "bob", date_last_accessed: "2025-03-10T10:00:00Z", duration: 0 })
    ];
    const row = BaseLabModel.buildMedianByDay(records, "course-1", ["2025-03-10"]);
    expect(row!["2025-03-10"]).toBe(10);
  });

  it("handles multiple dates correctly", () => {
    const records = [
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-10T10:00:00Z", duration: 10 }),
      makeLabRecord({ student_id: "alice", date_last_accessed: "2025-03-11T10:00:00Z", duration: 20 }),
      makeLabRecord({ student_id: "bob", date_last_accessed: "2025-03-10T10:00:00Z", duration: 30 }),
      makeLabRecord({ student_id: "bob", date_last_accessed: "2025-03-11T10:00:00Z", duration: 40 })
    ];
    const dates = ["2025-03-10", "2025-03-11"];
    const row = BaseLabModel.buildMedianByDay(records, "course-1", dates);

    // Date 2025-03-10: alice=10, bob=30 -> median = round((10+30)/2) = 20
    expect(row!["2025-03-10"]).toBe(20);
    // Date 2025-03-11: alice=20, bob=40 -> median = round((20+40)/2) = 30
    expect(row!["2025-03-11"]).toBe(30);
  });
});
