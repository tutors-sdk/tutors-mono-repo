import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import type { Composite, Course, Lo } from "../../../../packages/jsr/model/src/tutors.ts";
import type { LeafType, LoShape } from "../../../support/arbitraries/course-tree.ts";
import { indexedLos, labShape, loadCourse, shape } from "../../support/course.ts";

const feature = await loadFeature("tests/bdd/features/course/course-loading.feature");

describeFeature(feature, ({ Background, Rule }) => {
  let courseId: string;
  let title: string;
  let topics: LoShape[];
  let course: Course;

  const firstTopic = () => course.los[0] as Composite;
  const load = () => {
    course = loadCourse(courseId, title, topics);
  };

  // The Background runs before every scenario, so each one starts from a freshly published course.
  Background(({ Given, And }) => {
    Given("the generator has published the course {string} titled {string}", (_ctx, id: string, courseTitle: string) => {
      courseId = id;
      title = courseTitle;
    });
    And("the course has {number} topics with {number} labs each", (_ctx, topicCount: number, labCount: number) => {
      topics = Array.from({ length: topicCount }, (_, t) =>
        shape(
          "topic",
          `Topic ${t + 1}`,
          Array.from({ length: labCount }, (_, l) => labShape(`Lab ${t + 1}.${l + 1}`, [{ title: "Setup", contentMd: "# Setup" }]))
        )
      );
    });
  });

  Rule("When a student opens a course, the reader shall load the course title, its topics and a route for every learning object.", ({ RuleScenario }) => {
    RuleScenario("Successfully load a course", ({ When, Then, And }) => {
      When("the reader loads the course", load);
      Then("the course title should be {string}", (_ctx, expected: string) => {
        expect(course.title).toBe(expected);
        expect(course.courseId).toBe(courseId);
      });
      And("the course should have {number} topics", (_ctx, count: number) => {
        expect(course.los.filter((lo) => lo.type === "topic")).toHaveLength(count);
        expect(course.topicIndex.size).toBe(count);
      });
      And("every learning object should be reachable by its route", () => {
        const los = indexedLos(course);
        // 3 topics, 6 labs and one step per lab.
        expect(los).toHaveLength(15);
        for (const lo of los) expect(course.loIndex.get(lo.route)).toBe(lo);
      });
    });
  });

  Rule("When a student opens a course whose topic holds a unit, the reader shall list the unit under the topic and trace the breadcrumbs of its learning objects through both.", ({ RuleScenario }) => {
    RuleScenario("Load a course with nested units", ({ Given, When, Then, And }) => {
      Given("the first topic also holds a unit with {number} notes", (_ctx, noteCount: number) => {
        topics[0].children.push(
          shape(
            "unit",
            "Unit 1",
            Array.from({ length: noteCount }, (_, n) => shape("note", `Note ${n + 1}`))
          )
        );
      });
      When("the reader loads the course", load);
      Then("the first topic should list that unit", () => {
        expect(firstTopic().units?.units.map((unit) => unit.title)).toEqual(["Unit 1"]);
      });
      And("each note in the unit should trace its breadcrumbs through the unit and the first topic", () => {
        const unit = firstTopic().units!.units[0];
        expect(unit.los).toHaveLength(2);
        for (const note of unit.los) expect(note.breadCrumbs).toEqual([course, firstTopic(), unit, note]);
      });
    });
  });

  Rule("When a student opens a course holding a learning object of any published type, the reader shall keep that type and replace the course URL placeholder in its route.", ({ RuleScenarioOutline }) => {
    RuleScenarioOutline("Load different learning object types", ({ Given, When, Then, And }, variables) => {
      const type = () => variables.type as LeafType;
      Given("the first topic also holds a learning object of type {string}", () => {
        topics[0].children.push(shape(type(), `A ${type()}`));
      });
      When("the reader loads the course", load);
      Then("the first topic should hold a learning object of type {string}", () => {
        const found = firstTopic().los.filter((lo: Lo) => lo.title === `A ${type()}`);
        expect(found.map((lo) => lo.type)).toEqual([type()]);
      });
      And("no route in the course should carry an unresolved course placeholder", () => {
        for (const lo of indexedLos(course)) expect(lo.route).not.toContain("{{COURSEURL}}");
      });
    });
  });
});
