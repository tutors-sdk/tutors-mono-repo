import { describe, it, expect } from "vitest";
import { ConnectCourseSchema } from "../support/schemas";
import { validateAgainstSchema, validateArray, assertSchemaMatch } from "../support/validators";

const validCourseEnrollment = {
  id: "enroll-001",
  courseid: "cs101-2025",
  github_id: "gh-12345",
  role: "student" as const,
  enrolled_at: "2025-01-20T09:00:00Z",
};

describe("tutors-connect-courses table contract", () => {
  it("valid course enrollment passes", () => {
    const result = validateAgainstSchema(validCourseEnrollment, ConnectCourseSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("role 'student' is valid", () => {
    const enrollment = { ...validCourseEnrollment, role: "student" };
    const result = validateAgainstSchema(enrollment, ConnectCourseSchema);
    expect(result.valid).toBe(true);
  });

  it("role 'instructor' is valid", () => {
    const enrollment = { ...validCourseEnrollment, role: "instructor" };
    const result = validateAgainstSchema(enrollment, ConnectCourseSchema);
    expect(result.valid).toBe(true);
  });

  it("invalid role 'admin' fails", () => {
    const enrollment = { ...validCourseEnrollment, role: "admin" };
    const result = validateAgainstSchema(enrollment, ConnectCourseSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("role"))).toBe(true);
  });

  it("invalid role 'ta' fails", () => {
    const enrollment = { ...validCourseEnrollment, role: "ta" };
    const result = validateAgainstSchema(enrollment, ConnectCourseSchema);
    expect(result.valid).toBe(false);
  });

  it("missing courseid fails", () => {
    const { courseid, ...enrollment } = validCourseEnrollment;
    const result = validateAgainstSchema(enrollment, ConnectCourseSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("courseid"))).toBe(true);
  });

  it("missing github_id fails", () => {
    const { github_id, ...enrollment } = validCourseEnrollment;
    const result = validateAgainstSchema(enrollment, ConnectCourseSchema);
    expect(result.valid).toBe(false);
  });

  it("missing enrolled_at fails", () => {
    const { enrolled_at, ...enrollment } = validCourseEnrollment;
    const result = validateAgainstSchema(enrollment, ConnectCourseSchema);
    expect(result.valid).toBe(false);
  });

  it("array of enrollments for different roles all valid", () => {
    const enrollments = [
      validCourseEnrollment,
      { ...validCourseEnrollment, id: "enroll-002", github_id: "gh-67890", role: "instructor" },
    ];
    const result = validateArray(enrollments, ConnectCourseSchema);
    expect(result.valid).toBe(true);
  });

  it("assertSchemaMatch returns parsed enrollment on valid data", () => {
    const parsed = assertSchemaMatch(validCourseEnrollment, ConnectCourseSchema, "course enrollment");
    expect(parsed.role).toBe("student");
    expect(parsed.courseid).toBe("cs101-2025");
  });
});
