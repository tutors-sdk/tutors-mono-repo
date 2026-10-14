import { describe, it, expect, beforeEach } from "vitest";
import type { Course } from "@tutors/tutors-model-lib";
import { localStorageProfile } from "../../../packages/adapters/driven/profile-localstorage/src/index.ts";
import { forgetCourseVisit, setFavouriteCourse, visitCourse } from "../../../packages/application/src/index.ts";
import { FixedClock } from "../../../packages/application/src/testing/index.ts";

/**
 * The learner's record in the browser: the localStorage adapter of the ProfilePort, driven through
 * the course-visit use cases the way the reader drives it for a visitor who is not signed in.
 * A plain map stands in for localStorage; nothing else is mocked.
 */

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k)
};
const profile = localStorageProfile(() => storage);
const clock = new FixedClock(new Date("2026-10-14T10:00:00Z"));
const learner = "";

const visit = (course: Course) => visitCourse({ profile, clock })(learner, course);
const stored = () => JSON.parse(store.get("courseVisits") ?? "[]");

function createMockCourse(overrides: Partial<Course> = {}): Course {
  return {
    type: "course",
    courseId: overrides.courseId ?? "test-course-1",
    title: overrides.title ?? "Test Course",
    img: overrides.img ?? "https://example.com/img.png",
    properties: {
      credits: "5",
      ...(overrides.properties ?? {})
    },
    isPrivate: false,
    ...overrides
  } as Course;
}

beforeEach(() => store.clear());

describe("localStorageProfile: reading course visits", () => {
  it("loads course visits from localStorage when data exists", async () => {
    const visits = [{ id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" }];
    store.set("courseVisits", JSON.stringify(visits));

    expect(await profile.getCourseVisits(learner)).toEqual(visits);
  });

  it("returns an empty list when localStorage holds nothing", async () => {
    expect(await profile.getCourseVisits(learner)).toEqual([]);
  });

  it("returns an empty list when localStorage holds something unreadable", async () => {
    store.set("courseVisits", "{not json");

    expect(await profile.getCourseVisits(learner)).toEqual([]);
  });

  it("reads nothing on the server, where there is no storage", async () => {
    const serverSide = localStorageProfile(() => null);

    expect(await serverSide.getCourseVisits(learner)).toEqual([]);
    await expect(serverSide.saveCourseVisits(learner, [])).resolves.toBeUndefined();
  });
});

describe("localStorageProfile: saving course visits", () => {
  it("persists courseVisits to localStorage as JSON", async () => {
    const visits = [{ id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" }];

    await profile.saveCourseVisits(learner, visits);

    expect(stored()).toEqual(visits);
  });

  it("saves an empty array when no course visits exist", async () => {
    await profile.saveCourseVisits(learner, []);

    expect(stored()).toEqual([]);
  });
});

describe("visitCourse over localStorage", () => {
  it("creates a new visit record for a first-time course visit", async () => {
    const visits = await visit(createMockCourse({ courseId: "new-course", title: "New Course" }));

    expect(visits).toHaveLength(1);
    expect(visits[0].id).toBe("new-course");
    expect(visits[0].title).toBe("New Course");
    expect(visits[0].visits).toBe(1);
  });

  it("increments visit count for a previously visited course", async () => {
    const course = createMockCourse({ courseId: "repeat-course" });

    await visit(course);
    const visits = await visit(course);

    expect(visits).toHaveLength(1);
    expect(visits[0].visits).toBe(2);
  });

  it("updates lastVisit to the clock's time on a repeat visit", async () => {
    const course = createMockCourse({ courseId: "timestamp-course" });

    await visit(course);
    clock.set(new Date("2026-10-15T10:00:00Z"));
    const visits = await visit(course);

    expect(visits[0].lastVisit).toBe("2026-10-15T10:00:00.000Z");
    clock.set(new Date("2026-10-14T10:00:00Z"));
  });

  it("adds a new course to the beginning of the list", async () => {
    await visit(createMockCourse({ courseId: "first", title: "First" }));
    const visits = await visit(createMockCourse({ courseId: "second", title: "Second" }));

    expect(visits[0].id).toBe("second");
    expect(visits[1].id).toBe("first");
  });

  it("stores img when course has no icon", async () => {
    const visits = await visit(createMockCourse({ courseId: "img-course", img: "https://example.com/course.png", properties: { credits: "5" } as any }));

    expect(visits[0].img).toBe("https://example.com/course.png");
    expect(visits[0].icon).toBeUndefined();
  });

  it("stores icon when course has icon property", async () => {
    const visits = await visit(createMockCourse({ courseId: "icon-course", properties: { credits: "10", icon: "mdi:book" } as any }));

    expect(visits[0].icon).toBe("mdi:book");
  });

  it("stores credits from course properties", async () => {
    const visits = await visit(createMockCourse({ courseId: "credits-course", properties: { credits: "15" } as any }));

    expect(visits[0].credits).toBe("15");
  });

  it("persists to localStorage after logging a visit", async () => {
    await visit(createMockCourse({ courseId: "persist-course" }));

    expect(stored()).toHaveLength(1);
    expect(stored()[0].id).toBe("persist-course");
  });
});

describe("forgetCourseVisit over localStorage", () => {
  const forget = forgetCourseVisit({ profile });

  it("removes the specified course from visits", async () => {
    await profile.saveCourseVisits(learner, [
      { id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" },
      { id: "c2", title: "Course 2", lastVisit: "2025-01-02", credits: "10" }
    ]);

    const visits = await forget(learner, "c1");

    expect(visits).toHaveLength(1);
    expect(visits[0].id).toBe("c2");
    expect(stored()).toHaveLength(1);
  });

  it("does nothing when courseId is not found", async () => {
    await profile.saveCourseVisits(learner, [{ id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" }]);

    expect(await forget(learner, "nonexistent")).toHaveLength(1);
  });
});

describe("setFavouriteCourse over localStorage", () => {
  const favourite = setFavouriteCourse({ profile });

  it("sets favourite to true for an existing course and persists it", async () => {
    await profile.saveCourseVisits(learner, [{ id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" }]);

    const visits = await favourite(learner, "c1", true);

    expect(visits[0].favourite).toBe(true);
    expect(stored()[0].favourite).toBe(true);
  });

  it("does not modify visits when courseId is not found", async () => {
    await profile.saveCourseVisits(learner, [{ id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" }]);

    const visits = await favourite(learner, "nonexistent", true);

    expect(visits[0].favourite).toBeUndefined();
  });

  it("sets favourite to false for an existing course", async () => {
    await profile.saveCourseVisits(learner, [{ id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5", favourite: true }]);

    const visits = await favourite(learner, "c1", false);

    expect(visits[0].favourite).toBe(false);
  });
});

describe("localStorageProfile: sentiment and sharing", () => {
  it("round-trips the learner's sentiment under the key the reader has always used", async () => {
    expect(await profile.getSentiment(learner)).toBeNull();
    await profile.setSentiment(learner, "confused");
    expect(store.get("sentiment")).toBe("confused");
    expect(await profile.getSentiment(learner)).toBe("confused");
  });

  it("round-trips sharing as the string the reader has always stored", async () => {
    expect(await profile.getSharing(learner)).toBeNull();
    await profile.setSharing(learner, false);
    expect(store.get("share")).toBe("false");
    expect(await profile.getSharing(learner)).toBe(false);
  });

  it("upserting a learner keeps their sharing and sentiment, and nothing else", async () => {
    await profile.upsertLearner({ login: "alice", name: "Alice", email: null, image: null, sentiment: "delighted", sharing: true });

    expect([...store.keys()].sort()).toEqual(["sentiment", "share"]);
    expect(await profile.getSharing(learner)).toBe(true);
    expect(await profile.getSentiment(learner)).toBe("delighted");
  });
});
