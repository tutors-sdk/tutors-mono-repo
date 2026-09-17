import { describe, expect, it } from "vitest";
import { createWalls, pluraliseLoType } from "../../../packages/jsr/model/src/utils/course-utils";
import type { Course } from "../../../packages/jsr/model/src/types/index";

function makeLo(type: string, id: string, hide = false): any {
  return {
    type,
    id,
    title: `${type} ${id}`,
    summary: "",
    contentMd: "",
    route: `/${type}/${id}`,
    authLevel: 0,
    img: "",
    video: "",
    hide,
  };
}

function makeCourse(...los: any[]): Course {
  return { courseId: "test-course", los } as unknown as Course;
}

describe("pluraliseLoType", () => {
  it.each([
    ["note", "notes"],
    ["lab", "labs"],
    ["talk", "talks"],
    ["github", "githubs"],
  ])("appends 's' to %s", (type, expected) => {
    expect(pluraliseLoType(type)).toBe(expected);
  });

  it.each([
    ["class", "classes"],
    ["box", "boxes"],
    ["sketch", "sketches"],
    ["dash", "dashes"],
  ])("appends 'es' to %s, which ends in a sibilant", (type, expected) => {
    expect(pluraliseLoType(type)).toBe(expected);
  });

  it.each([["quiz"], ["Quiz"], ["QUIZ"]])("pluralises %s irregularly, since 'quizes' is a misspelling", (type) => {
    expect(pluraliseLoType(type)).toBe("quizzes");
  });
});

describe("createWalls", () => {
  it("builds a quiz wall when the course contains quizzes", () => {
    const course = makeCourse(makeLo("quiz", "q1"), makeLo("quiz", "q2"), makeLo("note", "n1"));
    createWalls(course);

    expect(course.wallMap?.get("quiz")).toHaveLength(2);
  });

  it("omits the quiz wall when the course has no quizzes", () => {
    const course = makeCourse(makeLo("note", "n1"));
    createWalls(course);

    expect(course.wallMap?.has("quiz")).toBe(false);
  });

  it("omits the quiz wall when every quiz is hidden", () => {
    const course = makeCourse(makeLo("quiz", "q1", true));
    createWalls(course);

    expect(course.wallMap?.has("quiz")).toBe(false);
  });

  it("gives the quiz wall link a grammatical tooltip", () => {
    const course = makeCourse(makeLo("quiz", "q1"));
    createWalls(course);

    const link = course.wallBar.bar.find((nav) => nav.type === "quiz");
    expect(link).toEqual({ link: "/wall/quiz/test-course", type: "quiz", tip: "All quizzes in the course", target: "" });
  });
});
