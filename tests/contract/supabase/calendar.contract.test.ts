import { describe, it, expect } from "vitest";
import { CalendarEntrySchema, IncrementCalendarParamsSchema } from "../support/schemas";
import { validateAgainstSchema, validateArray, assertSchemaMatch } from "../support/validators";

const validCalendarEntry = {
  id: "2025-06-01",
  studentid: "student-42",
  courseid: "cs101-2025",
  timeactive: 1800,
  pageloads: 7,
};

describe("calendar table contract", () => {
  it("valid calendar entry passes (id matches YYYY-MM-DD)", () => {
    const result = validateAgainstSchema(validCalendarEntry, CalendarEntrySchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("invalid date format (DD-MM-YYYY) fails", () => {
    const entry = { ...validCalendarEntry, id: "01-06-2025" };
    const result = validateAgainstSchema(entry, CalendarEntrySchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("id"))).toBe(true);
  });

  it("invalid date format (slash-separated) fails", () => {
    const entry = { ...validCalendarEntry, id: "2025/06/01" };
    const result = validateAgainstSchema(entry, CalendarEntrySchema);
    expect(result.valid).toBe(false);
  });

  it("full_name is optional and can be omitted", () => {
    const result = validateAgainstSchema(validCalendarEntry, CalendarEntrySchema);
    expect(result.valid).toBe(true);
  });

  it("full_name is accepted when provided", () => {
    const entry = { ...validCalendarEntry, full_name: "Jane Doe" };
    const result = validateAgainstSchema(entry, CalendarEntrySchema);
    expect(result.valid).toBe(true);
  });

  it("missing studentid fails", () => {
    const { studentid, ...entry } = validCalendarEntry;
    const result = validateAgainstSchema(entry, CalendarEntrySchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("studentid"))).toBe(true);
  });

  it("multiple entries with same courseid all valid", () => {
    const entries = [
      validCalendarEntry,
      { ...validCalendarEntry, id: "2025-06-02", studentid: "student-99", timeactive: 900 },
      { ...validCalendarEntry, id: "2025-06-03", studentid: "student-7", pageloads: 3 },
    ];
    const result = validateArray(entries, CalendarEntrySchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("assertSchemaMatch returns parsed entry on valid data", () => {
    const parsed = assertSchemaMatch(validCalendarEntry, CalendarEntrySchema, "calendar entry");
    expect(parsed.courseid).toBe("cs101-2025");
    expect(parsed.timeactive).toBe(1800);
  });

  it("timeactive must be a number", () => {
    const entry = { ...validCalendarEntry, timeactive: "1800" };
    const result = validateAgainstSchema(entry, CalendarEntrySchema);
    expect(result.valid).toBe(false);
  });
});

describe("increment_calendar RPC params contract", () => {
  const validParams = {
    courseid: "cs101-2025",
    studentid: "student-42",
    date: "2025-06-01",
    timeactive: 300,
    pageloads: 2,
  };

  it("valid increment_calendar params pass", () => {
    const result = validateAgainstSchema(validParams, IncrementCalendarParamsSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("missing required field (courseid) fails", () => {
    const { courseid, ...params } = validParams;
    const result = validateAgainstSchema(params, IncrementCalendarParamsSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("courseid"))).toBe(true);
  });

  it("missing required field (date) fails", () => {
    const { date, ...params } = validParams;
    const result = validateAgainstSchema(params, IncrementCalendarParamsSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("date"))).toBe(true);
  });

  it("missing required field (timeactive) fails", () => {
    const { timeactive, ...params } = validParams;
    const result = validateAgainstSchema(params, IncrementCalendarParamsSchema);
    expect(result.valid).toBe(false);
  });

  it("pageloads must be a number", () => {
    const params = { ...validParams, pageloads: "two" };
    const result = validateAgainstSchema(params, IncrementCalendarParamsSchema);
    expect(result.valid).toBe(false);
  });
});
