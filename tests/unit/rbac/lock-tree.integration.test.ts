import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Composite, Course, Lo } from "@tutors/tutors-model-lib";

vi.mock("../../../packages/svelte/utils/rbac/src/lock-store.ts", () => ({
  getLocksForCourse: vi.fn(),
  upsertLock: vi.fn(),
  removeLock: vi.fn(),
}));

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

import { contentLocks, courseProtocol } from "../../../packages/svelte/runes/src/index.svelte.ts";
import { decorateCourseTree } from "../../../packages/svelte/course/src/course/services/lo-tree.ts";
import { filterByType, flattenLos } from "@tutors/tutors-model-lib";
import { rbacService } from "../../../packages/svelte/utils/rbac/src/rbac-service.svelte.ts";

function buildCourse(): Course {
  return {
    title: "Test Course",
    type: "course",
    los: [
      {
        type: "topic",
        id: "week-01",
        title: "Week 01",
        route: "/topic/{{COURSEURL}}/week-01",
        los: [
          {
            type: "lab",
            id: "lab-01",
            title: "Lab 01",
            route: "/lab/{{COURSEURL}}/week-01/lab-01",
            los: [],
          } as Lo,
          {
            type: "talk",
            id: "talk-01",
            title: "Talk 01",
            route: "/talk/{{COURSEURL}}/week-01/talk-01",
            los: [],
          } as Lo,
        ],
      } as Composite,
      {
        type: "topic",
        id: "week-02",
        title: "Week 02",
        route: "/topic/{{COURSEURL}}/week-02",
        los: [
          {
            type: "lab",
            id: "lab-02",
            title: "Lab 02",
            route: "/lab/{{COURSEURL}}/week-02/lab-02",
            los: [],
          } as Lo,
        ],
      } as Composite,
    ],
  } as Course;
}

describe("isLoLocked with decorated course tree", () => {
  beforeEach(() => {
    courseProtocol.value = "https://";
    contentLocks.value = new Map();
  });

  it("hides only los under a locked topic on the course home and walls", () => {
    const course = buildCourse();
    decorateCourseTree(course, "cs101", "cs101.netlify.app");

    const topics = course.los;
    const lockedTopic = topics[0];
    const unlockedTopic = topics[1];
    const wallLabs = filterByType(course.los, "lab");

    contentLocks.value = new Map([[lockedTopic.route, true]]);

    expect(rbacService.isLoLocked(lockedTopic)).toBe(true);
    expect(rbacService.isLoLocked(unlockedTopic)).toBe(false);

    const lockedLabs = wallLabs.filter((lo) => rbacService.isLoLocked(lo));
    expect(lockedLabs.map((lo) => lo.id)).toEqual(["lab-01"]);
    expect(wallLabs.filter((lo) => !rbacService.isLoLocked(lo)).map((lo) => lo.id)).toEqual(["lab-02"]);
  });

  it("leaves all top-level topics visible when no locks are set", () => {
    const course = buildCourse();
    decorateCourseTree(course, "cs101", "cs101.netlify.app");

    const allLos = flattenLos(course.los);
    expect(allLos.every((lo) => !rbacService.isLoLocked(lo))).toBe(true);
  });
});

function buildCourseWithUnits(): Course {
  return {
    title: "Test Course",
    type: "course",
    los: [
      {
        type: "unit",
        id: "semester-1",
        title: "Semester 1",
        route: "/unit/{{COURSEURL}}/semester-1",
        los: [
          {
            type: "topic",
            id: "week-01",
            title: "Week 01",
            route: "/topic/{{COURSEURL}}/semester-1/week-01",
            los: [
              {
                type: "lab",
                id: "lab-01",
                title: "Lab 01",
                route: "/lab/{{COURSEURL}}/semester-1/week-01/lab-01",
                los: [],
              } as Lo,
            ],
          } as Composite,
          {
            type: "topic",
            id: "week-02",
            title: "Week 02",
            route: "/topic/{{COURSEURL}}/semester-1/week-02",
            los: [],
          } as Composite,
        ],
      } as Composite,
      {
        type: "unit",
        id: "semester-2",
        title: "Semester 2",
        route: "/unit/{{COURSEURL}}/semester-2",
        los: [
          {
            type: "topic",
            id: "week-03",
            title: "Week 03",
            route: "/topic/{{COURSEURL}}/semester-2/week-03",
            los: [],
          } as Composite,
        ],
      } as Composite,
    ],
  } as Course;
}

describe("isLoLocked with units containing topics", () => {
  beforeEach(() => {
    courseProtocol.value = "https://";
    contentLocks.value = new Map();
  });

  it("hides only the locked topic inside a unit, not sibling or other unit topics", () => {
    const course = buildCourseWithUnits();
    decorateCourseTree(course, "cs101", "cs101.netlify.app");

    const semester1 = course.los[0] as Composite;
    const semester2 = course.los[1] as Composite;
    const week01 = semester1.los[0];
    const week02 = semester1.los[1];
    const week03 = semester2.los[0];
    const lab01 = (week01 as Composite).los[0];

    contentLocks.value = new Map([[week01.route, true]]);

    expect(rbacService.isLoLocked(week01)).toBe(true);
    expect(rbacService.isLoLocked(lab01)).toBe(true);
    expect(rbacService.isLoLocked(week02)).toBe(false);
    expect(rbacService.isLoLocked(week03)).toBe(false);
  });

  it("does not treat collapsed unit routes as a shared lock ancestor", () => {
    const course = buildCourseWithUnits();
    decorateCourseTree(course, "cs101", "cs101.netlify.app");

    const semester1 = course.los[0] as Composite;
    const semester2 = course.los[1] as Composite;
    // buildUnit collapses every unit route to the same topic path in generated courses
    semester1.route = "/topic/cs101/";
    semester2.route = "/topic/cs101/";

    contentLocks.value = new Map([[semester1.los[0].route, true]]);

    expect(rbacService.isLoLocked(semester2.los[0])).toBe(false);
  });
});

function buildCourseWithTopicUnits(): Course {
  return {
    title: "Test Course",
    type: "course",
    los: [
      {
        type: "topic",
        id: "module-1",
        title: "Module 1",
        route: "/topic/{{COURSEURL}}/module-1",
        los: [
          {
            type: "unit",
            id: "week-1",
            title: "Week 1",
            route: "/unit/{{COURSEURL}}/module-1/week-1",
            los: [
              {
                type: "topic",
                id: "day-1",
                title: "Day 1",
                route: "/topic/{{COURSEURL}}/module-1/week-1/day-1",
                los: [
                  {
                    type: "lab",
                    id: "lab-01",
                    title: "Lab 01",
                    route: "/lab/{{COURSEURL}}/module-1/week-1/day-1/lab-01",
                    los: [],
                  } as Lo,
                ],
              } as Composite,
              {
                type: "topic",
                id: "day-2",
                title: "Day 2",
                route: "/topic/{{COURSEURL}}/module-1/week-1/day-2",
                los: [],
              } as Composite,
            ],
          } as Composite,
        ],
      } as Composite,
      {
        type: "topic",
        id: "module-2",
        title: "Module 2",
        route: "/topic/{{COURSEURL}}/module-2",
        los: [],
      } as Composite,
    ],
  } as Course;
}

describe("isLoLocked with topics containing units", () => {
  beforeEach(() => {
    courseProtocol.value = "https://";
    contentLocks.value = new Map();
  });

  it("keeps nested unit topics visible when a different top-level topic is locked", () => {
    const course = buildCourseWithTopicUnits();
    decorateCourseTree(course, "cs101", "cs101.netlify.app");

    const module1 = course.los[0] as Composite;
    const module2 = course.los[1];
    const week1 = (module1.los[0] as Composite);
    const day1 = week1.los[0];
    const day2 = week1.los[1];
    const lab01 = (day1 as Composite).los[0];

    contentLocks.value = new Map([[module2.route, true]]);

    expect(rbacService.isLoLocked(day1)).toBe(false);
    expect(rbacService.isLoLocked(day2)).toBe(false);
    expect(rbacService.isLoLocked(lab01)).toBe(false);
  });

  it("hides nested unit topics when their parent top-level topic is locked", () => {
    const course = buildCourseWithTopicUnits();
    decorateCourseTree(course, "cs101", "cs101.netlify.app");

    const module1 = course.los[0];
    const day1 = ((module1 as Composite).los[0] as Composite).los[0];

    contentLocks.value = new Map([[module1.route, true]]);

    expect(rbacService.isLoLocked(day1)).toBe(true);
  });
});
