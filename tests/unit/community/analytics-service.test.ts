import { describe, it, expect, vi, beforeEach } from "vitest";

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

beforeEach(() => {
  vi.clearAllMocks();
  analyticsService.loRoute = "";
});

describe("analyticsService.learningEvent", () => {
  it("sets loRoute to lo.route when params has no loid", () => {
    const lo = makeLo({ route: "course/test-course-1/topic/unit/lo-1" });

    analyticsService.learningEvent(makeCourse(), {}, lo, makeStudent());

    expect(analyticsService.loRoute).toBe("course/test-course-1/topic/unit/lo-1");
  });

  it("trims route and appends loid when params.loid is present", () => {
    const lo = makeLo({ route: "course/test-course-1/topic/unit/lo-1" });

    analyticsService.learningEvent(makeCourse(), { loid: "deep-page" }, lo, makeStudent());

    expect(analyticsService.loRoute).toBe("course/test-course-1/topic/deep-page");
  });

  it("trims route correctly when route has exactly 3 segments", () => {
    const lo = makeLo({ route: "course/test-course-1/topic" });

    analyticsService.learningEvent(makeCourse(), { loid: "item" }, lo, makeStudent());

    expect(analyticsService.loRoute).toBe("course/test-course-1/topic/item");
  });

  it("trims route correctly when route has fewer than 3 segments", () => {
    const lo = makeLo({ route: "course/test-course-1" });

    analyticsService.learningEvent(makeCourse(), { loid: "item" }, lo, makeStudent());

    expect(analyticsService.loRoute).toBe("course/test-course-1/item");
  });

  it("delegates to reportPageLoad after setting loRoute", () => {
    analyticsService.learningEvent(makeCourse(), {}, makeLo(), makeStudent());

    expect(mockStoreStudentCourseLearningObjectInSupabase).toHaveBeenCalledTimes(1);
  });

  it("passes the trimmed route to the supabase store when loid is present", () => {
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

  it("logs error when route manipulation throws", () => {
    const lo = makeLo({ route: undefined });

    analyticsService.learningEvent(makeCourse(), { loid: "x" }, lo, makeStudent());

    expect(log.error).toHaveBeenCalled();
    const errorMsg = (log.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(errorMsg).toContain("TutorStore Error:");
  });
});

describe("analyticsService.reportPageLoad", () => {
  it("delegates to storeStudentCourseLearningObjectInSupabase with loRoute", () => {
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

  it("uses the current loRoute value at call time", () => {
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

  it("logs error when the supabase call throws", () => {
    mockStoreStudentCourseLearningObjectInSupabase.mockImplementation(() => {
      throw new Error("DB failure");
    });

    analyticsService.reportPageLoad(makeCourse(), makeLo(), makeStudent());

    expect(log.error).toHaveBeenCalledWith("TutorStore Error: DB failure");
  });
});

describe("analyticsService.updatePageCount", () => {
  it("updates learning records duration when student and lo.route are present", () => {
    const course = makeCourse({ courseId: "c1" });
    const lo = makeLo({ route: "course/c1/topic" });
    const student = makeStudent({ login: "stu1" });
    analyticsService.loRoute = "tracked/route";

    analyticsService.updatePageCount(course, lo, student);

    expect(mockUpdateLearningRecordsDuration).toHaveBeenCalledWith("c1", "stu1", "tracked/route");
  });

  it("updates calendar duration with formatted date", () => {
    const course = makeCourse({ courseId: "c1" });
    const lo = makeLo({ route: "course/c1/topic" });
    const student = makeStudent({ login: "stu1" });

    analyticsService.updatePageCount(course, lo, student);

    expect(mockFormatDate).toHaveBeenCalled();
    expect(mockUpdateCalendarDuration).toHaveBeenCalledWith("2026-07-30", "stu1", "c1");
  });

  it("does not call any helper when student is falsy", () => {
    analyticsService.updatePageCount(makeCourse(), makeLo({ route: "course/c1/topic" }), null as any);

    expect(mockUpdateLearningRecordsDuration).not.toHaveBeenCalled();
    expect(mockUpdateCalendarDuration).not.toHaveBeenCalled();
  });

  it("skips learning records update when lo.route is empty", () => {
    analyticsService.updatePageCount(
      makeCourse({ courseId: "c1" }),
      makeLo({ route: "" }),
      makeStudent({ login: "stu1" })
    );

    expect(mockUpdateLearningRecordsDuration).not.toHaveBeenCalled();
    expect(mockUpdateCalendarDuration).toHaveBeenCalled();
  });

  it("logs error when a helper throws", () => {
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
  it("delegates to addOrUpdateStudent with session.user", async () => {
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
