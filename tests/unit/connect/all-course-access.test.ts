import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * AllCourseAccess tests.
 *
 * The allCourseAccess module tracks course access statistics in Supabase.
 * These tests mock the Supabase client and logger to verify updateCourseList
 * correctly upserts records and validates course names (rejecting branch-style
 * names like main--, deploy-preview--, master--).
 */

const { mockFrom, mockSelect, mockEq, mockSingle, mockUpsert, mockLogError } = vi.hoisted(() => {
  const mockSingle = vi.fn();
  const mockEq = vi.fn(() => ({ single: mockSingle }));
  const mockSelect = vi.fn(() => ({ eq: mockEq }));
  const mockUpsert = vi.fn();
  const mockFrom = vi.fn(() => ({
    select: mockSelect,
    upsert: mockUpsert,
    eq: mockEq
  }));
  const mockLogError = vi.fn();
  return { mockFrom, mockSelect, mockEq, mockSingle, mockUpsert, mockLogError };
});

vi.mock("$env/static/public", () => ({
  PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
  PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
  PUBLIC_ANON_MODE: "TRUE"
}));

vi.mock("@tutors/community/utils/supabase-client", () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args)
  }
}));

vi.mock("@tutors/logger", () => ({
  default: {
    error: (...args: any[]) => mockLogError(...args)
  }
}));

import { updateCourseList } from "../../../packages/svelte/connect/src/utils/allCourseAccess";
import type { Course } from "@tutors/tutors-model-lib";

function createMockCourse(overrides: Partial<Course> = {}): Course {
  return {
    type: "course",
    courseId: overrides.courseId ?? "valid-course-1",
    title: overrides.title ?? "Test Course",
    img: overrides.img ?? "https://example.com/img.png",
    properties: {
      credits: "5",
      ...(overrides.properties ?? {})
    },
    isPrivate: overrides.isPrivate ?? false,
    ...overrides
  } as Course;
}

describe("allCourseAccess: updateCourseList with valid course names", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("inserts a new course with visit_count 1 when course does not exist", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });

    const course = createMockCourse({ courseId: "new-course" });
    await updateCourseList(course);

    expect(mockFrom).toHaveBeenCalledWith("tutors-connect-courses");
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        course_id: "new-course",
        visit_count: 1
      }),
      { onConflict: "course_id" }
    );
  });

  it("increments visit_count when course already exists", async () => {
    mockSingle.mockResolvedValue({ data: { visit_count: 5 }, error: null });

    const course = createMockCourse({ courseId: "existing-course" });
    await updateCourseList(course);

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        course_id: "existing-course",
        visit_count: 6
      }),
      { onConflict: "course_id" }
    );
  });

  it("includes visited_at timestamp in the upsert", async () => {
    const before = new Date();
    const course = createMockCourse();
    await updateCourseList(course);

    const upsertArg = mockUpsert.mock.calls[0][0];
    const visitedAt = new Date(upsertArg.visited_at);
    expect(visitedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("includes course_record with correct id and title", async () => {
    const course = createMockCourse({ courseId: "record-course", title: "Record Course" });
    await updateCourseList(course);

    const upsertArg = mockUpsert.mock.calls[0][0];
    expect(upsertArg.course_record.id).toBe("record-course");
    expect(upsertArg.course_record.title).toBe("Record Course");
  });

  it("includes credits in the course_record", async () => {
    const course = createMockCourse({ properties: { credits: "10" } as any });
    await updateCourseList(course);

    const upsertArg = mockUpsert.mock.calls[0][0];
    expect(upsertArg.course_record.credits).toBe("10");
  });

  it("includes img in course_record when course has no icon", async () => {
    const course = createMockCourse({
      img: "https://example.com/thumb.png",
      properties: { credits: "5" } as any
    });
    await updateCourseList(course);

    const upsertArg = mockUpsert.mock.calls[0][0];
    expect(upsertArg.course_record.img).toBe("https://example.com/thumb.png");
    expect(upsertArg.course_record.icon).toBeUndefined();
  });

  it("includes icon in course_record when course has icon property", async () => {
    const course = createMockCourse({
      properties: { credits: "5", icon: "mdi:school" } as any
    });
    await updateCourseList(course);

    const upsertArg = mockUpsert.mock.calls[0][0];
    expect(upsertArg.course_record.icon).toBe("mdi:school");
  });

  it("includes isPrivate flag in the course_record", async () => {
    const course = createMockCourse({ isPrivate: true });
    await updateCourseList(course);

    const upsertArg = mockUpsert.mock.calls[0][0];
    expect(upsertArg.course_record.private).toBe(true);
  });

  it("calls from with tutors-connect-courses table twice (select + upsert)", async () => {
    const course = createMockCourse();
    await updateCourseList(course);

    const fromCalls = mockFrom.mock.calls.filter((c) => c[0] === "tutors-connect-courses");
    expect(fromCalls).toHaveLength(2);
  });

  it("passes onConflict course_id option to upsert", async () => {
    const course = createMockCourse();
    await updateCourseList(course);

    expect(mockUpsert).toHaveBeenCalledWith(expect.anything(), { onConflict: "course_id" });
  });
});

describe("allCourseAccess: isValidCourseName rejects invalid names", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    mockUpsert.mockResolvedValue({ error: null });
  });

  it("rejects course names starting with main--", async () => {
    const course = createMockCourse({ courseId: "main--some-branch" });
    await updateCourseList(course);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects course names starting with master--", async () => {
    const course = createMockCourse({ courseId: "master--some-branch" });
    await updateCourseList(course);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects course names starting with deploy-preview--", async () => {
    const course = createMockCourse({ courseId: "deploy-preview--123" });
    await updateCourseList(course);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("rejects course names containing double hyphens anywhere", async () => {
    const course = createMockCourse({ courseId: "some--invalid--name" });
    await updateCourseList(course);

    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("accepts a normal course name", async () => {
    const course = createMockCourse({ courseId: "web-development-2025" });
    await updateCourseList(course);

    expect(mockFrom).toHaveBeenCalled();
  });

  it("accepts a course name with single hyphens", async () => {
    const course = createMockCourse({ courseId: "intro-to-programming" });
    await updateCourseList(course);

    expect(mockFrom).toHaveBeenCalled();
  });
});

describe("allCourseAccess: error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs error and returns early when select fails with non-PGRST116 error", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: "UNEXPECTED", message: "DB error" } });

    const course = createMockCourse();
    await updateCourseList(course);

    expect(mockLogError).toHaveBeenCalledWith("Error fetching row:", expect.objectContaining({ code: "UNEXPECTED" }));
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("logs error when upsert fails", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    mockUpsert.mockResolvedValue({ error: { message: "Upsert failed" } });

    const course = createMockCourse();
    await updateCourseList(course);

    expect(mockLogError).toHaveBeenCalledWith("Error upserting row:", expect.objectContaining({ message: "Upsert failed" }));
  });

  it("does not log error when select returns PGRST116 (row not found)", async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: "PGRST116" } });
    mockUpsert.mockResolvedValue({ error: null });

    const course = createMockCourse();
    await updateCourseList(course);

    expect(mockLogError).not.toHaveBeenCalled();
  });

  it("does not log error when upsert succeeds", async () => {
    mockSingle.mockResolvedValue({ data: { visit_count: 3 }, error: null });
    mockUpsert.mockResolvedValue({ error: null });

    const course = createMockCourse();
    await updateCourseList(course);

    expect(mockLogError).not.toHaveBeenCalled();
  });
});
