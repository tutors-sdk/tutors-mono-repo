import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockSupabaseClient } from "../../bdd/support/mocks";

vi.mock("$env/static/public", () => ({
  PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
  PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
  PUBLIC_ANON_MODE: "TRUE"
}));

vi.mock("@tutors/community/utils/supabase-client", async () => {
  const { MockSupabaseClient } = await import("../../bdd/support/mocks");
  return { supabase: new MockSupabaseClient() };
});

vi.mock("@tutors/logger", () => ({
  default: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn()
  }
}));

import { supabase } from "@tutors/community/utils/supabase-client";
import { updateCourseList } from "../../../packages/svelte/connect/src/utils/allCourseAccess";
import type { Course } from "@tutors/tutors-model-lib";
import log from "@tutors/logger";

const mockClient = supabase as unknown as MockSupabaseClient;

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
    mockClient.clearAllErrors();
    mockClient.setTableData("tutors-connect-courses", []);
  });

  it("inserts a new course with visit_count 1 when course does not exist", async () => {
    const course = createMockCourse({ courseId: "new-course" });
    await updateCourseList(course);

    const store = mockClient.getTableData("tutors-connect-courses") as any[];
    expect(store).toHaveLength(1);
    expect(store[0].course_id).toBe("new-course");
    expect(store[0].visit_count).toBe(1);
  });

  it("increments visit_count when course already exists", async () => {
    mockClient.setTableData("tutors-connect-courses", [
      { course_id: "existing-course", visit_count: 5 }
    ]);

    const course = createMockCourse({ courseId: "existing-course" });
    await updateCourseList(course);

    const store = mockClient.getTableData("tutors-connect-courses") as any[];
    expect(store).toHaveLength(1);
    expect(store[0].visit_count).toBe(6);
  });

  it("includes visited_at timestamp in the upserted record", async () => {
    const before = new Date();
    const course = createMockCourse();
    await updateCourseList(course);

    const store = mockClient.getTableData("tutors-connect-courses") as any[];
    const visitedAt = new Date(store[0].visited_at);
    expect(visitedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it("includes course_record with correct id and title", async () => {
    const course = createMockCourse({ courseId: "record-course", title: "Record Course" });
    await updateCourseList(course);

    const store = mockClient.getTableData("tutors-connect-courses") as any[];
    expect(store[0].course_record.id).toBe("record-course");
    expect(store[0].course_record.title).toBe("Record Course");
  });

  it("includes credits in the course_record", async () => {
    const course = createMockCourse({ properties: { credits: "10" } as any });
    await updateCourseList(course);

    const store = mockClient.getTableData("tutors-connect-courses") as any[];
    expect(store[0].course_record.credits).toBe("10");
  });

  it("includes img in course_record when course has no icon", async () => {
    const course = createMockCourse({
      img: "https://example.com/thumb.png",
      properties: { credits: "5" } as any
    });
    await updateCourseList(course);

    const store = mockClient.getTableData("tutors-connect-courses") as any[];
    expect(store[0].course_record.img).toBe("https://example.com/thumb.png");
    expect(store[0].course_record.icon).toBeUndefined();
  });

  it("includes icon in course_record when course has icon property", async () => {
    const course = createMockCourse({
      properties: { credits: "5", icon: "mdi:school" } as any
    });
    await updateCourseList(course);

    const store = mockClient.getTableData("tutors-connect-courses") as any[];
    expect(store[0].course_record.icon).toBe("mdi:school");
  });

  it("includes isPrivate flag in the course_record", async () => {
    const course = createMockCourse({ isPrivate: true });
    await updateCourseList(course);

    const store = mockClient.getTableData("tutors-connect-courses") as any[];
    expect(store[0].course_record.private).toBe(true);
  });

  it("passes onConflict course_id to upsert", async () => {
    const course = createMockCourse({ courseId: "conflict-test" });

    await updateCourseList(course);
    await updateCourseList(course);

    const store = mockClient.getTableData("tutors-connect-courses") as any[];
    expect(store).toHaveLength(1);
  });
});

describe("allCourseAccess: isValidCourseName rejects invalid names", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.clearAllErrors();
    mockClient.setTableData("tutors-connect-courses", []);
  });

  it("rejects course names starting with main--", async () => {
    const course = createMockCourse({ courseId: "main--some-branch" });
    await updateCourseList(course);

    expect(mockClient.getTableData("tutors-connect-courses")).toHaveLength(0);
  });

  it("rejects course names starting with master--", async () => {
    const course = createMockCourse({ courseId: "master--some-branch" });
    await updateCourseList(course);

    expect(mockClient.getTableData("tutors-connect-courses")).toHaveLength(0);
  });

  it("rejects course names starting with deploy-preview--", async () => {
    const course = createMockCourse({ courseId: "deploy-preview--123" });
    await updateCourseList(course);

    expect(mockClient.getTableData("tutors-connect-courses")).toHaveLength(0);
  });

  it("rejects course names containing double hyphens anywhere", async () => {
    const course = createMockCourse({ courseId: "some--invalid--name" });
    await updateCourseList(course);

    expect(mockClient.getTableData("tutors-connect-courses")).toHaveLength(0);
  });

  it("accepts a normal course name", async () => {
    const course = createMockCourse({ courseId: "web-development-2025" });
    await updateCourseList(course);

    expect(mockClient.getTableData("tutors-connect-courses")).toHaveLength(1);
  });

  it("accepts a course name with single hyphens", async () => {
    const course = createMockCourse({ courseId: "intro-to-programming" });
    await updateCourseList(course);

    expect(mockClient.getTableData("tutors-connect-courses")).toHaveLength(1);
  });
});

describe("allCourseAccess: error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.clearAllErrors();
    mockClient.setTableData("tutors-connect-courses", []);
  });

  it("logs error and does not upsert when select fails with non-PGRST116 error", async () => {
    mockClient.setTableError("tutors-connect-courses", { code: "UNEXPECTED", message: "DB error" });

    const course = createMockCourse();
    await updateCourseList(course);

    expect(log.error).toHaveBeenCalledWith("Error fetching row:", expect.objectContaining({ code: "UNEXPECTED" }));
    expect(mockClient.getTableData("tutors-connect-courses")).toHaveLength(0);
  });

  it("does not log error when select returns PGRST116 (row not found)", async () => {
    const course = createMockCourse();
    await updateCourseList(course);

    expect(log.error).not.toHaveBeenCalled();
  });

  it("does not log error when upsert succeeds", async () => {
    mockClient.setTableData("tutors-connect-courses", [
      { course_id: "valid-course-1", visit_count: 3 }
    ]);

    const course = createMockCourse();
    await updateCourseList(course);

    expect(log.error).not.toHaveBeenCalled();
  });
});
