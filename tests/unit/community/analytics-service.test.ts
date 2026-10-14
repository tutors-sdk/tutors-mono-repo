import { describe, it, expect, vi, beforeEach } from "vitest";
import { FixedClock, InMemoryProfile, RecordingPublisher } from "../../../packages/application/src/testing/index.ts";
import type { LearningEvent } from "../../../packages/domain/src/learning/index.ts";

/**
 * The analytics service turns what the reader shows into learning events and hands them to the
 * LearningEventSink the app composed. A recording sink stands in for the store; the clock is fixed.
 */

vi.mock("../../../packages/platform/logger/src/index.ts", () => ({
  default: {
    error: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    setDefaultLevel: vi.fn()
  }
}));

import { configureAdapters } from "../../../packages/adapters/driving/svelte-state/src/adapters.ts";
import { analyticsService } from "../../../packages/adapters/driving/svelte-state/src/community/services/analytics.svelte.ts";
import log from "../../../packages/platform/logger/src/index.ts";

const record = vi.fn<(event: LearningEvent, learnerId: string) => Promise<void>>();
const profile = new InMemoryProfile();
const upsertLearner = vi.spyOn(profile, "upsertLearner");

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

/** Let the fire-and-forget recording promise run to completion. */
const settle = async () => {
  for (let i = 0; i < 3; i++) await Promise.resolve();
};

beforeEach(() => {
  vi.clearAllMocks();
  record.mockResolvedValue(undefined);
  analyticsService.loRoute = "";
  analyticsService.stepId = undefined;
  configureAdapters({
    anonymous: false,
    clock: new FixedClock(new Date("2026-10-14T10:00:00Z")),
    learningEvents: { record },
    profile: { local: profile, signedIn: null },
    publisher: new RecordingPublisher()
  });
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

  it("records one page load through the composed sink", async () => {
    analyticsService.learningEvent(makeCourse(), {}, makeLo(), makeStudent());
    await settle();

    expect(record).toHaveBeenCalledTimes(1);
  });

  it("records the page load against the trimmed route when loid is present", async () => {
    const course = makeCourse();
    const lo = makeLo({ route: "course/test-course-1/topic/unit/lo-1" });

    analyticsService.learningEvent(course, { loid: "deep-page" }, lo, makeStudent({ login: "stu1" }));
    await settle();

    expect(record).toHaveBeenCalledWith(
      { kind: "page-load", courseId: "test-course-1", loId: "course/test-course-1/topic/deep-page", loType: "note", day: "2026-10-14" },
      "stu1"
    );
  });

  it("records nothing for a visitor who is not signed in", async () => {
    analyticsService.learningEvent(makeCourse(), {}, makeLo(), null as any);
    await settle();

    expect(record).not.toHaveBeenCalled();
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
  it("records the learning object on screen", async () => {
    const course = makeCourse();
    const lo = makeLo({ route: "some/route" });

    analyticsService.reportPageLoad(course, lo, makeStudent());
    await settle();

    expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: "page-load", loId: "some/route" }), "teststudent");
  });

  it("records each call with the step it was given", async () => {
    const course = makeCourse();
    const lo = makeLo({ route: "course/c/topic/unit/lo" });
    const student = makeStudent();

    analyticsService.stepId = "first";
    analyticsService.reportPageLoad(course, lo, student);
    analyticsService.stepId = "second";
    analyticsService.reportPageLoad(course, lo, student);
    await settle();

    expect(record).toHaveBeenCalledTimes(2);
    expect(record.mock.calls[1][0].loId).toBe("course/c/topic/second");
  });

  it("logs error when the sink rejects", async () => {
    record.mockRejectedValue(new Error("DB failure"));

    analyticsService.reportPageLoad(makeCourse(), makeLo(), makeStudent());
    await settle();

    expect(log.error).toHaveBeenCalledWith("TutorStore Error:", expect.objectContaining({ message: "DB failure" }));
  });

  it("logs error when the sink throws synchronously", async () => {
    record.mockImplementation(() => {
      throw new Error("DB failure");
    });

    analyticsService.reportPageLoad(makeCourse(), makeLo(), makeStudent());
    await settle();

    expect(log.error).toHaveBeenCalledWith("TutorStore Error:", expect.objectContaining({ message: "DB failure" }));
  });
});

describe("analyticsService.updatePageCount", () => {
  it("records a tick against the learning object on screen when student and lo.route are present", async () => {
    analyticsService.updatePageCount(makeCourse({ courseId: "c1" }), makeLo({ route: "course/c1/topic" }), makeStudent({ login: "stu1" }));
    await settle();

    expect(record).toHaveBeenCalledWith({ kind: "tick", courseId: "c1", loId: "course/c1/topic", day: "2026-10-14" }, "stu1");
  });

  it("does not record when student is falsy", async () => {
    analyticsService.updatePageCount(makeCourse(), makeLo({ route: "course/c1/topic" }), null as any);
    await settle();

    expect(record).not.toHaveBeenCalled();
  });

  it("records against the day only when lo.route is empty", async () => {
    analyticsService.updatePageCount(makeCourse({ courseId: "c1" }), makeLo({ route: "" }), makeStudent({ login: "stu1" }));
    await settle();

    expect(record).toHaveBeenCalledWith({ kind: "tick", courseId: "c1", loId: null, day: "2026-10-14" }, "stu1");
  });

  it("logs error when recording throws", async () => {
    record.mockImplementation(() => {
      throw new Error("heartbeat fail");
    });

    analyticsService.updatePageCount(makeCourse(), makeLo({ route: "course/c1/topic" }), makeStudent());
    await settle();

    expect(log.error).toHaveBeenCalledWith("TutorStore Error:", expect.objectContaining({ message: "heartbeat fail" }));
  });
});

describe("analyticsService.updateLogin", () => {
  it("upserts the learner's profile from session.user", async () => {
    const session = { user: { login: "stu1", name: "Student One" } as any };

    await analyticsService.updateLogin("course-1", session);

    expect(upsertLearner).toHaveBeenCalledWith({ login: "stu1", name: "Student One", email: null, image: null, sentiment: null, sharing: null });
  });

  it("does not throw when the upsert succeeds", async () => {
    await expect(analyticsService.updateLogin("course-1", { user: makeStudent() })).resolves.toBeUndefined();
  });

  it("logs error when the upsert rejects", async () => {
    upsertLearner.mockRejectedValueOnce(new Error("upsert failed"));

    await analyticsService.updateLogin("course-1", { user: makeStudent() });

    expect(log.error).toHaveBeenCalledWith("TutorStore Error:", expect.objectContaining({ message: "upsert failed" }));
  });
});
