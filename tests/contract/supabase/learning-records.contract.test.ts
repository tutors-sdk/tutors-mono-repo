import { describe, it, expect } from "vitest";
import { LearningRecordSchema, GetCountLearningRecordsParamsSchema } from "../support/schemas";
import { validateAgainstSchema, validateArray, assertSchemaMatch } from "../support/validators";

const validLearningRecord = {
  id: "lr-001",
  courseid: "cs101-2025",
  studentid: "student-42",
  lo_id: "lo-lab-01",
  type: "lab",
  timeactive: 3600,
  pageloads: 12,
  date: "2025-06-01",
};

describe("learning_records table contract", () => {
  it("valid learning record passes schema", () => {
    const result = validateAgainstSchema(validLearningRecord, LearningRecordSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("missing required field (courseid) fails", () => {
    const { courseid, ...record } = validLearningRecord;
    const result = validateAgainstSchema(record, LearningRecordSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("courseid"))).toBe(true);
  });

  it("missing required field (studentid) fails", () => {
    const { studentid, ...record } = validLearningRecord;
    const result = validateAgainstSchema(record, LearningRecordSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("studentid"))).toBe(true);
  });

  it("invalid timeactive (string instead of number) fails", () => {
    const record = { ...validLearningRecord, timeactive: "not-a-number" };
    const result = validateAgainstSchema(record, LearningRecordSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("timeactive"))).toBe(true);
  });

  it("invalid pageloads (string instead of number) fails", () => {
    const record = { ...validLearningRecord, pageloads: "five" };
    const result = validateAgainstSchema(record, LearningRecordSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("pageloads"))).toBe(true);
  });

  it("array of valid records all pass", () => {
    const records = [
      validLearningRecord,
      { ...validLearningRecord, id: "lr-002", lo_id: "lo-note-03", type: "note", timeactive: 120 },
      { ...validLearningRecord, id: "lr-003", lo_id: "lo-talk-01", type: "talk", pageloads: 1 },
    ];
    const result = validateArray(records, LearningRecordSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("array with one invalid record reports errors for that index", () => {
    const records = [validLearningRecord, { ...validLearningRecord, id: "lr-bad", timeactive: "bad" }];
    const result = validateArray(records, LearningRecordSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith("[1]"))).toBe(true);
  });

  it("assertSchemaMatch returns parsed data on valid record", () => {
    const parsed = assertSchemaMatch(validLearningRecord, LearningRecordSchema, "learning record");
    expect(parsed.id).toBe("lr-001");
    expect(parsed.timeactive).toBe(3600);
  });

  it("assertSchemaMatch throws on invalid record", () => {
    const bad = { ...validLearningRecord, date: 12345 };
    expect(() => assertSchemaMatch(bad, LearningRecordSchema, "learning record")).toThrow(
      /Schema validation failed/,
    );
  });
});

describe("get_count_learning_records RPC params contract", () => {
  it("valid params with courseid and studentid pass", () => {
    const params = { courseid: "cs101-2025", studentid: "student-42" };
    const result = validateAgainstSchema(params, GetCountLearningRecordsParamsSchema);
    expect(result.valid).toBe(true);
  });

  it("missing courseid fails", () => {
    const params = { studentid: "student-42" };
    const result = validateAgainstSchema(params, GetCountLearningRecordsParamsSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("courseid"))).toBe(true);
  });

  it("optional studentid can be omitted", () => {
    const params = { courseid: "cs101-2025" };
    const result = validateAgainstSchema(params, GetCountLearningRecordsParamsSchema);
    expect(result.valid).toBe(true);
  });

  it("empty courseid string still passes schema (no min-length constraint)", () => {
    const params = { courseid: "" };
    const result = validateAgainstSchema(params, GetCountLearningRecordsParamsSchema);
    expect(result.valid).toBe(true);
  });
});
