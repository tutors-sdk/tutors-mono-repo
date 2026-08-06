import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * LocalStorageProfile tests.
 *
 * The localStorageProfile service manages course visit history and preferences
 * in browser localStorage. These tests mock the $app/environment module and
 * the global localStorage to verify all ProfileStore methods work correctly.
 */

vi.mock("$app/environment", () => ({
  browser: true
}));

const store = new Map<string, string>();

Object.defineProperty(global, "localStorage", {
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k)
  },
  writable: true,
  configurable: true
});

// localStorage.courseVisits is accessed as a direct property, not via getItem/setItem
// so we need to handle property access on the localStorage mock
Object.defineProperty(global.localStorage, "courseVisits", {
  get: () => store.get("courseVisits") ?? undefined,
  set: (v: string) => store.set("courseVisits", v),
  configurable: true
});

import { localStorageProfile } from "../../../packages/svelte/connect/src/services/localStorageProfile";
import type { Course } from "@tutors/tutors-model-lib";

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

describe("localStorageProfile: reload", () => {
  beforeEach(() => {
    store.clear();
    localStorageProfile.courseVisits = [];
  });

  it("loads course visits from localStorage when data exists", () => {
    const visits = [{ id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" }];
    store.set("courseVisits", JSON.stringify(visits));

    localStorageProfile.reload();

    expect(localStorageProfile.courseVisits).toEqual(visits);
  });

  it("does not overwrite courseVisits when localStorage is empty", () => {
    localStorageProfile.courseVisits = [{ id: "existing", title: "Existing", lastVisit: "2025-01-01", credits: "5" }];

    localStorageProfile.reload();

    expect(localStorageProfile.courseVisits).toEqual([
      { id: "existing", title: "Existing", lastVisit: "2025-01-01", credits: "5" }
    ]);
  });
});

describe("localStorageProfile: save", () => {
  beforeEach(() => {
    store.clear();
    localStorageProfile.courseVisits = [];
  });

  it("persists courseVisits to localStorage as JSON", () => {
    localStorageProfile.courseVisits = [{ id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" }];

    localStorageProfile.save();

    const stored = store.get("courseVisits");
    expect(stored).toBeDefined();
    expect(JSON.parse(stored!)).toEqual(localStorageProfile.courseVisits);
  });

  it("saves empty array when no course visits exist", () => {
    localStorageProfile.save();

    const stored = store.get("courseVisits");
    expect(JSON.parse(stored!)).toEqual([]);
  });
});

describe("localStorageProfile: logCourseVisit", () => {
  beforeEach(() => {
    store.clear();
    localStorageProfile.courseVisits = [];
  });

  it("creates a new visit record for a first-time course visit", () => {
    const course = createMockCourse({ courseId: "new-course", title: "New Course" });

    localStorageProfile.logCourseVisit(course);

    expect(localStorageProfile.courseVisits).toHaveLength(1);
    expect(localStorageProfile.courseVisits[0].id).toBe("new-course");
    expect(localStorageProfile.courseVisits[0].title).toBe("New Course");
    expect(localStorageProfile.courseVisits[0].visits).toBe(1);
  });

  it("increments visit count for a previously visited course", () => {
    const course = createMockCourse({ courseId: "repeat-course" });

    localStorageProfile.logCourseVisit(course);
    localStorageProfile.logCourseVisit(course);

    expect(localStorageProfile.courseVisits).toHaveLength(1);
    expect(localStorageProfile.courseVisits[0].visits).toBe(2);
  });

  it("updates lastVisit timestamp on repeat visit", () => {
    const course = createMockCourse({ courseId: "timestamp-course" });

    localStorageProfile.logCourseVisit(course);
    const firstVisit = localStorageProfile.courseVisits[0].lastVisit;

    localStorageProfile.logCourseVisit(course);
    const secondVisit = localStorageProfile.courseVisits[0].lastVisit;

    expect(secondVisit).toBeDefined();
    expect(new Date(secondVisit).getTime()).toBeGreaterThanOrEqual(new Date(firstVisit).getTime());
  });

  it("adds new course to beginning of the array (unshift)", () => {
    const course1 = createMockCourse({ courseId: "first", title: "First" });
    const course2 = createMockCourse({ courseId: "second", title: "Second" });

    localStorageProfile.logCourseVisit(course1);
    localStorageProfile.logCourseVisit(course2);

    expect(localStorageProfile.courseVisits[0].id).toBe("second");
    expect(localStorageProfile.courseVisits[1].id).toBe("first");
  });

  it("stores img when course has no icon", () => {
    const course = createMockCourse({
      courseId: "img-course",
      img: "https://example.com/course.png",
      properties: { credits: "5" } as any
    });

    localStorageProfile.logCourseVisit(course);

    expect(localStorageProfile.courseVisits[0].img).toBe("https://example.com/course.png");
    expect(localStorageProfile.courseVisits[0].icon).toBeUndefined();
  });

  it("stores icon when course has icon property", () => {
    const course = createMockCourse({
      courseId: "icon-course",
      properties: { credits: "10", icon: "mdi:book" } as any
    });

    localStorageProfile.logCourseVisit(course);

    expect(localStorageProfile.courseVisits[0].icon).toBe("mdi:book");
  });

  it("stores credits from course properties", () => {
    const course = createMockCourse({
      courseId: "credits-course",
      properties: { credits: "15" } as any
    });

    localStorageProfile.logCourseVisit(course);

    expect(localStorageProfile.courseVisits[0].credits).toBe("15");
  });

  it("persists to localStorage after logging visit", () => {
    const course = createMockCourse({ courseId: "persist-course" });

    localStorageProfile.logCourseVisit(course);

    const stored = store.get("courseVisits");
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("persist-course");
  });
});

describe("localStorageProfile: deleteCourseVisit", () => {
  beforeEach(() => {
    store.clear();
    localStorageProfile.courseVisits = [];
  });

  it("removes the specified course from visits", () => {
    localStorageProfile.courseVisits = [
      { id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" },
      { id: "c2", title: "Course 2", lastVisit: "2025-01-02", credits: "10" }
    ];
    store.set("courseVisits", JSON.stringify(localStorageProfile.courseVisits));

    localStorageProfile.deleteCourseVisit("c1");

    expect(localStorageProfile.courseVisits).toHaveLength(1);
    expect(localStorageProfile.courseVisits[0].id).toBe("c2");
  });

  it("does nothing when courseId is not found", () => {
    localStorageProfile.courseVisits = [
      { id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" }
    ];
    store.set("courseVisits", JSON.stringify(localStorageProfile.courseVisits));

    localStorageProfile.deleteCourseVisit("nonexistent");

    expect(localStorageProfile.courseVisits).toHaveLength(1);
  });
});

describe("localStorageProfile: getCourseVisits", () => {
  beforeEach(() => {
    store.clear();
    localStorageProfile.courseVisits = [];
  });

  it("returns all course visits", async () => {
    const visits = [
      { id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" },
      { id: "c2", title: "Course 2", lastVisit: "2025-01-02", credits: "10" }
    ];
    localStorageProfile.courseVisits = visits;
    store.set("courseVisits", JSON.stringify(visits));

    const result = await localStorageProfile.getCourseVisits();

    expect(result).toEqual(visits);
  });

  it("returns empty array when no visits exist", async () => {
    const result = await localStorageProfile.getCourseVisits();

    expect(result).toEqual([]);
  });
});

describe("localStorageProfile: favouriteCourse", () => {
  beforeEach(() => {
    store.clear();
    localStorageProfile.courseVisits = [];
  });

  it("sets favourite to true for an existing course", () => {
    localStorageProfile.courseVisits = [
      { id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" }
    ];
    store.set("courseVisits", JSON.stringify(localStorageProfile.courseVisits));

    localStorageProfile.favouriteCourse("c1");

    expect(localStorageProfile.courseVisits[0].favourite).toBe(true);
  });

  it("does not modify visits when courseId is not found", () => {
    localStorageProfile.courseVisits = [
      { id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" }
    ];
    store.set("courseVisits", JSON.stringify(localStorageProfile.courseVisits));

    localStorageProfile.favouriteCourse("nonexistent");

    expect(localStorageProfile.courseVisits[0].favourite).toBeUndefined();
  });

  it("persists favourite status to localStorage", () => {
    localStorageProfile.courseVisits = [
      { id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5" }
    ];
    store.set("courseVisits", JSON.stringify(localStorageProfile.courseVisits));

    localStorageProfile.favouriteCourse("c1");

    const stored = JSON.parse(store.get("courseVisits")!);
    expect(stored[0].favourite).toBe(true);
  });
});

describe("localStorageProfile: unfavouriteCourse", () => {
  beforeEach(() => {
    store.clear();
    localStorageProfile.courseVisits = [];
  });

  it("sets favourite to false for an existing course", () => {
    localStorageProfile.courseVisits = [
      { id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5", favourite: true }
    ];
    store.set("courseVisits", JSON.stringify(localStorageProfile.courseVisits));

    localStorageProfile.unfavouriteCourse("c1");

    expect(localStorageProfile.courseVisits[0].favourite).toBe(false);
  });

  it("does not modify visits when courseId is not found", () => {
    localStorageProfile.courseVisits = [
      { id: "c1", title: "Course 1", lastVisit: "2025-01-01", credits: "5", favourite: true }
    ];
    store.set("courseVisits", JSON.stringify(localStorageProfile.courseVisits));

    localStorageProfile.unfavouriteCourse("nonexistent");

    expect(localStorageProfile.courseVisits[0].favourite).toBe(true);
  });
});
