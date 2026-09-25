import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRecordLearningPageLoad, mockRecordLearningTick, mockAddOrUpdateStudent } = vi.hoisted(() => ({
  mockRecordLearningPageLoad: vi.fn(),
  mockRecordLearningTick: vi.fn(),
  mockAddOrUpdateStudent: vi.fn()
}));

vi.mock("../../../packages/svelte/community/src/utils/supabase-client.ts", () => ({
  recordLearningPageLoad: mockRecordLearningPageLoad,
  recordLearningTick: mockRecordLearningTick,
  addOrUpdateStudent: mockAddOrUpdateStudent,
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

    expect(mockRecordLearningPageLoad).toHaveBeenCalledTimes(1);
  });

  it("passes the trimmed route to the reader when loid is present", () => {
    const course = makeCourse();
    const lo = makeLo({ route: "course/test-course-1/topic/unit/lo-1" });

    analyticsService.learningEvent(course, { loid: "deep-page" }, lo, makeStudent());

    expect(mockRecordLearningPageLoad).toHaveBeenCalledWith(course, "course/test-course-1/topic/deep-page", lo);
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
  it("records the page load of loRoute through the reader, without a student id", () => {
    const course = makeCourse();
    const lo = makeLo();
    analyticsService.loRoute = "some/route";

    analyticsService.reportPageLoad(course, lo, makeStudent());

    expect(mockRecordLearningPageLoad).toHaveBeenCalledWith(course, "some/route", lo);
  });

  it("uses the current loRoute value at call time", () => {
    const course = makeCourse();
    const lo = makeLo();
    const student = makeStudent();

    analyticsService.loRoute = "first/route";
    analyticsService.reportPageLoad(course, lo, student);

    analyticsService.loRoute = "second/route";
    analyticsService.reportPageLoad(course, lo, student);

    expect(mockRecordLearningPageLoad).toHaveBeenCalledTimes(2);
    expect(mockRecordLearningPageLoad.mock.calls[1][1]).toBe("second/route");
  });

  it("logs error when recording throws", () => {
    mockRecordLearningPageLoad.mockImplementation(() => {
      throw new Error("DB failure");
    });

    analyticsService.reportPageLoad(makeCourse(), makeLo(), makeStudent());

    expect(log.error).toHaveBeenCalledWith("TutorStore Error:", expect.objectContaining({ message: "DB failure" }));
  });
});

describe("analyticsService.updatePageCount", () => {
  it("records a tick against the tracked learning object when student and lo.route are present", () => {
    const course = makeCourse({ courseId: "c1" });
    const lo = makeLo({ route: "course/c1/topic" });
    analyticsService.loRoute = "tracked/route";

    analyticsService.updatePageCount(course, lo, makeStudent({ login: "stu1" }));

    expect(mockRecordLearningTick).toHaveBeenCalledWith("c1", "tracked/route");
  });

  it("does not record anything when student is falsy", () => {
    analyticsService.updatePageCount(makeCourse(), makeLo({ route: "course/c1/topic" }), null as any);

    expect(mockRecordLearningTick).not.toHaveBeenCalled();
  });

  it("records calendar time only when lo.route is empty", () => {
    analyticsService.updatePageCount(
      makeCourse({ courseId: "c1" }),
      makeLo({ route: "" }),
      makeStudent({ login: "stu1" })
    );

    expect(mockRecordLearningTick).toHaveBeenCalledWith("c1", null);
  });

  it("logs error when recording throws", () => {
    mockRecordLearningTick.mockImplementation(() => {
      throw new Error("duration fail");
    });

    analyticsService.updatePageCount(
      makeCourse(),
      makeLo({ route: "course/c1/topic" }),
      makeStudent()
    );

    expect(log.error).toHaveBeenCalledWith("TutorStore Error:", expect.objectContaining({ message: "duration fail" }));
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

    expect(log.error).toHaveBeenCalledWith("TutorStore Error:", expect.objectContaining({ message: "upsert failed" }));
  });
});
