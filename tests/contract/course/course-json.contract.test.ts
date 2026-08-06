import { describe, it, expect } from "vitest";
import { CourseJsonSchema } from "../support/schemas";
import { validateAgainstSchema, assertSchemaMatch } from "../support/validators";

const validLoBase = {
  type: "lab",
  id: "lab-01",
  title: "Getting Started",
  summary: "An introductory lab",
  contentMd: "# Lab 01\nWelcome...",
  route: "/cs101/topic-01/lab-01",
  authLevel: 0,
  img: "https://example.com/lab01.png",
  video: "",
  hide: false,
};

const validTopic = {
  type: "topic" as const,
  id: "topic-01",
  title: "Introduction",
  route: "/cs101/topic-01",
  los: [validLoBase],
};

const validCourseJson = {
  type: "course" as const,
  id: "cs101-2025",
  title: "Introduction to Computer Science",
  summary: "A first course in CS",
  route: "/cs101",
  courseId: "cs101-2025",
  courseUrl: "https://tutors.dev/cs101-2025",
  authLevel: 0,
  isPortfolio: false,
  isPrivate: false,
  los: [validTopic],
};

describe("course JSON structure contract", () => {
  it("valid course JSON passes full schema", () => {
    const result = validateAgainstSchema(validCourseJson, CourseJsonSchema);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("course type must be 'course'", () => {
    const course = { ...validCourseJson, type: "module" };
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
  });

  it("required field id must be present", () => {
    const { id, ...course } = validCourseJson;
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(false);
  });

  it("required field title must be present", () => {
    const { title, ...course } = validCourseJson;
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(false);
  });

  it("required field courseId must be present", () => {
    const { courseId, ...course } = validCourseJson;
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(false);
  });

  it("required field courseUrl must be present", () => {
    const { courseUrl, ...course } = validCourseJson;
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(false);
  });

  it("isPortfolio must be boolean", () => {
    const course = { ...validCourseJson, isPortfolio: "true" };
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("isPortfolio"))).toBe(true);
  });

  it("isPrivate must be boolean", () => {
    const course = { ...validCourseJson, isPrivate: 1 };
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("isPrivate"))).toBe(true);
  });

  it("authLevel must be a number", () => {
    const course = { ...validCourseJson, authLevel: "public" };
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("authLevel"))).toBe(true);
  });

  it("los array can contain topic objects", () => {
    const course = { ...validCourseJson, los: [validTopic] };
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(true);
  });

  it("los array can contain simple LO objects", () => {
    const course = { ...validCourseJson, los: [validLoBase] };
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(true);
  });

  it("los array can contain mixed topic and LO objects", () => {
    const course = { ...validCourseJson, los: [validTopic, validLoBase] };
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(true);
  });

  it("empty los array is valid", () => {
    const course = { ...validCourseJson, los: [] };
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(true);
  });

  it("missing title fails", () => {
    const { title, ...course } = validCourseJson;
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("title"))).toBe(true);
  });

  it("assertSchemaMatch returns parsed course on valid data", () => {
    const parsed = assertSchemaMatch(validCourseJson, CourseJsonSchema, "course json");
    expect(parsed.type).toBe("course");
    expect(parsed.courseId).toBe("cs101-2025");
    expect(parsed.los).toHaveLength(1);
  });

  it("missing summary fails", () => {
    const { summary, ...course } = validCourseJson;
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(false);
  });

  it("missing los array fails", () => {
    const { los, ...course } = validCourseJson;
    const result = validateAgainstSchema(course, CourseJsonSchema);
    expect(result.valid).toBe(false);
  });
});
