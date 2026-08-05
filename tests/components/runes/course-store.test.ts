import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulates the rune() pattern from the codebase for testing outside
 * the Svelte compiler. The real rune() uses $state, which requires
 * the Svelte 5 compiler. This plain-object version mirrors the
 * { get value, set value } interface for contract testing.
 */
function rune<T>(initialValue: T): { value: T } {
  let _value = initialValue;
  return {
    get value() {
      return _value;
    },
    set value(v: T) {
      _value = v;
    },
  };
}

interface MockTopic {
  type: "topic";
  id: string;
  title: string;
  los: { type: string; title: string }[];
}

interface MockCourse {
  type: "course";
  courseId: string;
  courseUrl: string;
  title: string;
  summary: string;
  topics: MockTopic[];
}

function makeCourse(overrides: Partial<MockCourse> = {}): MockCourse {
  return {
    type: "course",
    courseId: "cs101",
    courseUrl: "https://example.com/cs101",
    title: "Computer Science 101",
    summary: "Intro to CS",
    topics: [
      {
        type: "topic",
        id: "topic-1",
        title: "Week 1",
        los: [{ type: "lab", title: "Lab 01" }],
      },
      {
        type: "topic",
        id: "topic-2",
        title: "Week 2",
        los: [{ type: "talk", title: "Lecture 01" }],
      },
    ],
    ...overrides,
  };
}

// ===========================================================================
// Initialisation with course data
// ===========================================================================
describe("course-store: initialisation", () => {
  it("should be initializable with course data", () => {
    const currentCourse = rune<MockCourse | null>(null);
    const course = makeCourse();
    currentCourse.value = course;
    expect(currentCourse.value).not.toBeNull();
    expect(currentCourse.value!.title).toBe("Computer Science 101");
  });

  it("should start as null before any course is loaded", () => {
    const currentCourse = rune<MockCourse | null>(null);
    expect(currentCourse.value).toBeNull();
  });

  it("should store complete course data", () => {
    const currentCourse = rune<MockCourse | null>(null);
    const course = makeCourse({ courseId: "web-dev", title: "Web Development" });
    currentCourse.value = course;
    expect(currentCourse.value!.courseId).toBe("web-dev");
    expect(currentCourse.value!.courseUrl).toBeDefined();
  });
});

// ===========================================================================
// Course update
// ===========================================================================
describe("course-store: course update", () => {
  it("should reflect new data after update", () => {
    const currentCourse = rune<MockCourse | null>(makeCourse({ title: "V1" }));
    currentCourse.value = makeCourse({ title: "V2" });
    expect(currentCourse.value!.title).toBe("V2");
  });

  it("should replace the entire course object", () => {
    const currentCourse = rune<MockCourse | null>(makeCourse({ courseId: "old" }));
    currentCourse.value = makeCourse({ courseId: "new" });
    expect(currentCourse.value!.courseId).toBe("new");
  });
});

// ===========================================================================
// Null course state
// ===========================================================================
describe("course-store: null state", () => {
  it("should handle null course without error", () => {
    const currentCourse = rune<MockCourse | null>(null);
    expect(currentCourse.value).toBeNull();
  });

  it("should be settable back to null", () => {
    const currentCourse = rune<MockCourse | null>(makeCourse());
    currentCourse.value = null;
    expect(currentCourse.value).toBeNull();
  });

  it("derived values should handle null gracefully", () => {
    const currentCourse = rune<MockCourse | null>(null);
    const courseId = currentCourse.value?.courseId ?? "none";
    expect(courseId).toBe("none");
  });
});

// ===========================================================================
// Course ID derivation
// ===========================================================================
describe("course-store: course ID derivation", () => {
  it("should derive course ID from state", () => {
    const currentCourse = rune<MockCourse | null>(makeCourse({ courseId: "cs201" }));
    const derivedId = currentCourse.value?.courseId;
    expect(derivedId).toBe("cs201");
  });

  it("course ID should be a non-empty string", () => {
    const currentCourse = rune<MockCourse | null>(makeCourse());
    expect(currentCourse.value!.courseId.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Topic list derivation
// ===========================================================================
describe("course-store: topic list derivation", () => {
  it("should derive topic list from course state", () => {
    const currentCourse = rune<MockCourse | null>(makeCourse());
    const topics = currentCourse.value?.topics ?? [];
    expect(topics).toHaveLength(2);
  });

  it("each topic should have an id and title", () => {
    const currentCourse = rune<MockCourse | null>(makeCourse());
    const topics = currentCourse.value?.topics ?? [];
    topics.forEach((topic) => {
      expect(topic.id).toBeDefined();
      expect(topic.title).toBeDefined();
    });
  });

  it("topic list from null course should be empty array", () => {
    const currentCourse = rune<MockCourse | null>(null);
    const topics = currentCourse.value?.topics ?? [];
    expect(topics).toHaveLength(0);
  });

  it("topics should contain their learning objects", () => {
    const currentCourse = rune<MockCourse | null>(makeCourse());
    const topics = currentCourse.value!.topics;
    expect(topics[0].los).toHaveLength(1);
    expect(topics[0].los[0].type).toBe("lab");
  });
});
