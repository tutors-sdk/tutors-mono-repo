import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Analytics service unit tests.
 *
 * Tests the analyticsService object from community/src/services/analytics.svelte.ts.
 * All Supabase helper functions are mocked so tests run without a database connection.
 * The logger is spied on (not module-mocked) to verify error logging.
 */

// --- vi.hoisted: functions declared here are available in the vi.mock factory ---

const {
  mockStoreStudentCourseLearningObjectInSupabase,
  mockUpdateLearningRecordsDuration,
  mockUpdateCalendarDuration,
  mockAddOrUpdateStudent,
  mockFormatDate
} = vi.hoisted(() => ({
  mockStoreStudentCourseLearningObjectInSupabase: vi.fn(),
  mockUpdateLearningRecordsDuration: vi.fn(),
  mockUpdateCalendarDuration: vi.fn(),
  mockAddOrUpdateStudent: vi.fn(),
  mockFormatDate: vi.fn(() => "2026-07-30")
}));

vi.mock("../../../packages/svelte/community/src/utils/supabase-client.ts", () => ({
  storeStudentCourseLearningObjectInSupabase: mockStoreStudentCourseLearningObjectInSupabase,
  updateLearningRecordsDuration: mockUpdateLearningRecordsDuration,
  updateCalendarDuration: mockUpdateCalendarDuration,
  addOrUpdateStudent: mockAddOrUpdateStudent,
  formatDate: mockFormatDate,
  supabase: {}
}));

vi.mock("../../../packages/svelte/utils/logger/src/index.ts", () => ({
  default: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    setDefaultLevel: vi.fn()
  }
}));

import { analyticsService } from "../../../packages/svelte/community/src/services/analytics.svelte.ts";
import log from "../../../packages/svelte/utils/logger/src/index.ts";

// --- test fixtures ---

function makeCourse(overrides: Record<string, unknown> = {}) {
  return {
    type: "course" as const,
    courseId: "test-course-1",
    courseUrl: "https://example.com/course",
    id: "course-1",
    title: "Test Course",
    summary: "",
    contentMd: "",
    route: "course/test-course-1",
    authLevel: 0,
    ...overrides
  } as any;
}

function makeLo(overrides: Record<string, unknown> = {}) {
  return {
    type: "note",
    id: "lo-1",
    title: "Test LO",
    summary: "",
    contentMd: "",
    route: "course/test-course-1/topic/unit/lo-1",
    authLevel: 0,
    ...overrides
  } as any;
}

function makeStudent(overrides: Record<string, unknown> = {}) {
  return {
    name: "Test Student",
    login: "teststudent",
    email: "test@example.com",
    image: "https://example.com/avatar.png",
    share: "true",
    sentiment: "neutral",
    ...overrides
  } as any;
}

// --- tests ---

beforeEach(() => {
  vi.clearAllMocks();
  analyticsService.loRoute = "";
});

describe("analyticsService.learningEvent", () => {
  it("sets loRoute to lo.route when params has no loid", () => {
    const course = makeCourse();
    const lo = makeLo({ route: "course/test-course-1/topic/unit/lo-1" });
    const student = makeStudent();

    analyticsService.learningEvent(course, {}, lo, student);

    expect(analyticsService.loRoute).toBe("course/test-course-1/topic/unit/lo-1");
  });

  it("trims route and appends loid when params.loid is present", () => {
    const course = makeCourse();
    const lo = makeLo({ route: "course/test-course-1/topic/unit/lo-1" });
    const student = makeStudent();

    analyticsService.learningEvent(course, { loid: "deep-page" }, lo, student);

    // route split: ["course", "test-course-1", "topic", "unit", "lo-1"]
    // sliced to first 3: "course/test-course-1/topic"
    // appended: "course/test-course-1/topic/deep-page"
    expect(analyticsService.loRoute).toBe("course/test-course-1/topic/deep-page");
  });

  it("trims route correctly when route has exactly 3 segments", () => {
    const course = makeCourse();
    const lo = makeLo({ route: "course/test-course-1/topic" });
    const student = makeStudent();

    analyticsService.learningEvent(course, { loid: "item" }, lo, student);

    expect(analyticsService.loRoute).toBe("course/test-course-1/topic/item");
  });

  it("trims route correctly when route has fewer than 3 segments", () => {
    const course = makeCourse();
    const lo = makeLo({ route: "course/test-course-1" });
    const student = makeStudent();

    analyticsService.learningEvent(course, { loid: "item" }, lo, student);

    // slice(0,3) on 2-element array gives both: "course/test-course-1"
    expect(analyticsService.loRoute).toBe("course/test-course-1/item");
  });

  it("calls reportPageLoad after setting loRoute", () => {
    const course = makeCourse();
    const lo = makeLo();
    const student = makeStudent();

    analyticsService.learningEvent(course, {}, lo, student);

    expect(mockStoreStudentCourseLearningObjectInSupabase).toHaveBeenCalledTimes(1);
  });

  it("calls storeStudentCourseLearningObjectInSupabase with the trimmed route when loid is present", () => {
    const course = makeCourse();
    const lo = makeLo({ route: "course/test-course-1/topic/unit/lo-1" });
    const student = makeStudent();

    analyticsService.learningEvent(course, { loid: "deep-page" }, lo, student);

    expect(mockStoreStudentCourseLearningObjectInSupabase).toHaveBeenCalledWith(
      course,
      "course/test-course-1/topic/deep-page",
      lo,
      student
    );
  });

  it("logs error when an exception is thrown", () => {
    const course = makeCourse();
    const student = makeStudent();
    // lo.route.split will throw if lo.route is undefined and params.loid is set
    const lo = makeLo({ route: undefined });

    analyticsService.learningEvent(course, { loid: "x" }, lo, student);

    expect(log.error).toHaveBeenCalled();
    const errorMsg = (log.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(errorMsg).toContain("TutorStore Error:");
  });
});

describe("analyticsService.reportPageLoad", () => {
  it("calls storeStudentCourseLearningObjectInSupabase with correct args", () => {
    const course = makeCourse();
    const lo = makeLo();
    const student = makeStudent();
    analyticsService.loRoute = "some/route";

    analyticsService.reportPageLoad(course, lo, student);

    expect(mockStoreStudentCourseLearningObjectInSupabase).toHaveBeenCalledWith(
      course,
      "some/route",
      lo,
      student
    );
  });

  it("uses the current loRoute value", () => {
    const course = makeCourse();
    const lo = makeLo();
    const student = makeStudent();
    analyticsService.loRoute = "first/route";
    analyticsService.reportPageLoad(course, lo, student);

    analyticsService.loRoute = "second/route";
    analyticsService.reportPageLoad(course, lo, student);

    expect(mockStoreStudentCourseLearningObjectInSupabase).toHaveBeenCalledTimes(2);
    expect(mockStoreStudentCourseLearningObjectInSupabase.mock.calls[1][1]).toBe("second/route");
  });

  it("logs error when storeStudentCourseLearningObjectInSupabase throws", () => {
    mockStoreStudentCourseLearningObjectInSupabase.mockImplementation(() => {
      throw new Error("DB failure");
    });

    analyticsService.reportPageLoad(makeCourse(), makeLo(), makeStudent());

    expect(log.error).toHaveBeenCalledWith("TutorStore Error: DB failure");
  });
});

describe("analyticsService.updatePageCount", () => {
  it("calls updateLearningRecordsDuration when student and lo.route are present", () => {
    const course = makeCourse({ courseId: "c1" });
    const lo = makeLo({ route: "course/c1/topic" });
    const student = makeStudent({ login: "stu1" });
    analyticsService.loRoute = "tracked/route";

    analyticsService.updatePageCount(course, lo, student);

    expect(mockUpdateLearningRecordsDuration).toHaveBeenCalledWith("c1", "stu1", "tracked/route");
  });

  it("calls updateCalendarDuration with formatted date", () => {
    const course = makeCourse({ courseId: "c1" });
    const lo = makeLo({ route: "course/c1/topic" });
    const student = makeStudent({ login: "stu1" });

    analyticsService.updatePageCount(course, lo, student);

    expect(mockFormatDate).toHaveBeenCalled();
    expect(mockUpdateCalendarDuration).toHaveBeenCalledWith("2026-07-30", "stu1", "c1");
  });

  it("does not call any helper when student is falsy", () => {
    const course = makeCourse();
    const lo = makeLo({ route: "course/c1/topic" });

    analyticsService.updatePageCount(course, lo, null as any);

    expect(mockUpdateLearningRecordsDuration).not.toHaveBeenCalled();
    expect(mockUpdateCalendarDuration).not.toHaveBeenCalled();
  });

  it("skips updateLearningRecordsDuration when lo.route is empty", () => {
    const course = makeCourse({ courseId: "c1" });
    const lo = makeLo({ route: "" });
    const student = makeStudent({ login: "stu1" });

    analyticsService.updatePageCount(course, lo, student);

    expect(mockUpdateLearningRecordsDuration).not.toHaveBeenCalled();
    // calendar update still happens
    expect(mockUpdateCalendarDuration).toHaveBeenCalled();
  });

  it("logs error when an exception is thrown", () => {
    mockUpdateLearningRecordsDuration.mockImplementation(() => {
      throw new Error("duration fail");
    });

    analyticsService.updatePageCount(
      makeCourse(),
      makeLo({ route: "course/c1/topic" }),
      makeStudent()
    );

    expect(log.error).toHaveBeenCalledWith("TutorStore Error: duration fail");
  });
});

describe("analyticsService.updateLogin", () => {
  it("calls addOrUpdateStudent with session.user", async () => {
    const session = { user: { login: "stu1", name: "Student One" } };

    await analyticsService.updateLogin("course-1", session);

    expect(mockAddOrUpdateStudent).toHaveBeenCalledWith(session.user);
  });

  it("does not throw when addOrUpdateStudent succeeds", async () => {
    mockAddOrUpdateStudent.mockResolvedValue(undefined);

    await expect(
      analyticsService.updateLogin("course-1", { user: makeStudent() })
    ).resolves.toBeUndefined();
  });

  it("logs error when addOrUpdateStudent rejects", async () => {
    mockAddOrUpdateStudent.mockRejectedValue(new Error("upsert failed"));

    await analyticsService.updateLogin("course-1", { user: makeStudent() });

    expect(log.error).toHaveBeenCalledWith("TutorStore Error: upsert failed");
  });
});
