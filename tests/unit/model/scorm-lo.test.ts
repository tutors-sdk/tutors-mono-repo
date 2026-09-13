import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Composite, Course, Lo, Scorm } from "@tutors/tutors-model-lib";

/**
 * Registration of the `scorm` learning-object type.
 *
 * A new type has to be declared in several places that have no compile-time link to each
 * other — `LoType` is a bare string — so each one is asserted here rather than assumed.
 */

// The reader's tree decorator reads Svelte runes, which need a plain stand-in under Node.
vi.mock("../../../packages/svelte/runes/src/index.svelte.ts", () => {
  const rune = <T>(initial: T) => ({ value: initial });
  return {
    rune,
    contentLocks: rune(new Map<string, boolean>()),
    isEducator: rune(false),
    locksLoaded: rune(false),
    tutorsId: rune(null),
    currentCourse: rune(null),
    courseProtocol: rune("https://"),
  };
});

import { createWalls, filterByType, flattenLos, injectCourseUrl, isCompositeLo, preOrder, simpleTypes } from "@tutors/tutors-model-lib";
import { getLoType } from "../../../packages/jsr/gen/src/services/resource-builder.ts";
import { getRoute } from "../../../packages/jsr/gen/src/utils/lr-utils.ts";
import { courseProtocol } from "../../../packages/svelte/runes/src/index.svelte.ts";
import { decorateCourseTree } from "../../../packages/svelte/course/src/course/services/lo-tree.ts";

function makeScormLo(overrides: Record<string, unknown> = {}): Scorm {
  return {
    type: "scorm",
    id: "scorm-quiz",
    title: "Vendor Quiz",
    summary: "",
    contentMd: "",
    route: "/scorm/{{COURSEURL}}/topic-01/scorm-quiz",
    scorm: "https://{{COURSEURL}}/topic-01/scorm-quiz/package/index.html",
    scormFile: "index.html",
    scormVersion: "1.2",
    authLevel: 0,
    img: "https://{{COURSEURL}}/topic-01/scorm-quiz/scorm-quiz.png",
    video: "",
    hide: false,
    frontMatter: {},
    los: [],
    ...overrides,
  } as unknown as Scorm;
}

function makeCourse(los: Lo[]): Course {
  return {
    type: "course",
    id: "smoke",
    title: "Smoke Course",
    route: "/course/{{COURSEURL}}",
    los: [
      {
        type: "topic",
        id: "topic-01",
        title: "Topic One",
        route: "/topic/{{COURSEURL}}/topic-01",
        hide: false,
        los,
      } as unknown as Composite,
    ],
  } as unknown as Course;
}

describe("the scorm type is registered", () => {
  it("is a simple type, not a composite one", () => {
    expect(simpleTypes).toContain("scorm");
    expect(isCompositeLo({ type: "scorm" } as Lo)).toBe(false);
  });

  it("has a display order, so sorting does not drop it to the front", () => {
    expect(preOrder.has("scorm")).toBe(true);
    expect(preOrder.get("scorm")!).toBeGreaterThan(preOrder.get("topic")!);
  });

  it("is recognised from a scorm- folder prefix", () => {
    expect(getLoType("/topic-01/scorm-quiz")).toBe("scorm");
    expect(getLoType("/topic-01/scorm")).toBe("scorm");
    expect(getLoType("/week-01/handouts")).toBe("unknown");
  });

  it("routes under /scorm/, which the reader's route folder has to match", () => {
    const route = getRoute({ type: "scorm", route: "/course/topic-01/scorm-quiz", courseRoot: "/course", lrs: [], files: [], id: "scorm-quiz" });
    expect(route).toBe("/scorm/{{COURSEURL}}/topic-01/scorm-quiz");
  });

  it("gets a wall of its own, like the other content types", () => {
    const course = makeCourse([makeScormLo()]);
    course.courseId = "smoke";
    createWalls(course);
    expect(course.wallMap?.get("scorm")?.map((lo) => lo.id)).toEqual(["scorm-quiz"]);
    expect(course.wallBar.bar.some((link) => link.link === "/wall/scorm/smoke")).toBe(true);
  });
});

describe("injectCourseUrl for a scorm learning object", () => {
  it("substitutes the course url into the launch address", () => {
    const scorm = makeScormLo();
    injectCourseUrl([scorm], "smoke", "smoke.netlify.app");
    expect(scorm.scorm).toBe("https://smoke.netlify.app/topic-01/scorm-quiz/package/index.html");
  });

  it("substitutes the course id into the route, as for every other type", () => {
    const scorm = makeScormLo();
    injectCourseUrl([scorm], "smoke", "smoke.netlify.app");
    expect(scorm.route).toBe("/scorm/smoke/topic-01/scorm-quiz");
  });

  it("leaves a learning object that has no package alone", () => {
    const scorm = makeScormLo({ scorm: undefined });
    expect(() => injectCourseUrl([scorm], "smoke", "smoke.netlify.app")).not.toThrow();
    expect(scorm.scorm).toBeUndefined();
  });
});

/**
 * The reader keeps its own copy of the tree decorator, and the whiteboard type needed a
 * follow-up hotfix because only the model copy was updated. These assert the twin.
 */
describe("the reader's course tree", () => {
  beforeEach(() => {
    courseProtocol.value = "https://";
  });

  it("substitutes the course url into the launch address", () => {
    const course = makeCourse([makeScormLo()]);
    decorateCourseTree(course, "smoke", "smoke.netlify.app");
    const scorm = flattenLos(course.los).find((lo) => lo.type === "scorm") as Scorm;
    expect(scorm.scorm).toBe("https://smoke.netlify.app/topic-01/scorm-quiz/package/index.html");
  });

  it("serves the package over http when the course itself is served over http", () => {
    // A mixed-content iframe is blocked outright, so the SCO would simply not load.
    courseProtocol.value = "http://";
    const course = makeCourse([makeScormLo()]);
    decorateCourseTree(course, "localhost:5173", "localhost:5173");
    const scorm = flattenLos(course.los).find((lo) => lo.type === "scorm") as Scorm;
    expect(scorm.scorm).toBe("http://localhost:5173/topic-01/scorm-quiz/package/index.html");
  });

  it("indexes the learning object by its route, so the reader can resolve it", () => {
    const course = makeCourse([makeScormLo()]);
    decorateCourseTree(course, "smoke", "smoke.netlify.app");
    expect(course.loIndex.get("/scorm/smoke/topic-01/scorm-quiz")?.type).toBe("scorm");
  });

  it("gathers the packages onto a wall", () => {
    const course = makeCourse([makeScormLo(), makeScormLo({ id: "scorm-lecture", route: "/scorm/{{COURSEURL}}/topic-01/scorm-lecture" })]);
    decorateCourseTree(course, "smoke", "smoke.netlify.app");
    expect(filterByType(course.los, "scorm").map((lo) => lo.id)).toEqual(["scorm-quiz", "scorm-lecture"]);
  });
});
