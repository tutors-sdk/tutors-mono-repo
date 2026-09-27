import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import type { Composite, Course } from "../../../../packages/jsr/model/src/tutors.ts";
import type { LoShape } from "../../../support/arbitraries/course-tree.ts";
import { labShape, loadCourse, shape } from "../../support/course.ts";

const feature = await loadFeature("tests/bdd/features/instructor/course-authoring.feature");

type TableRow = Record<string, string>;

const list = (csv: string) => csv.split(",").map((item) => item.trim());

/** A data-table cell as the generator would publish it from properties.yaml: a boolean, a number or text. */
function propertyValue(cell: string): unknown {
  if (cell === "true" || cell === "false") return cell === "true";
  return Number.isNaN(Number(cell)) ? cell : Number(cell);
}

describeFeature(feature, ({ Scenario }) => {
  let topics: LoShape[];
  let properties: Record<string, unknown>;
  let course: Course;

  const firstTopic = () => course.los[0] as Composite;
  // Every scenario publishes generator JSON and loads it through the reader's decorateCourseTree.
  const load = () => {
    course = loadCourse("authored-course", "Authored Course", topics, properties);
  };

  Scenario("Course structure loads correctly", ({ Given, When, Then, And }) => {
    Given("an instructor has authored a course with {number} topics:", (_ctx, count: number, table: TableRow[]) => {
      topics = table.map((row) => shape("topic", row.title, [shape("note", `${row.title} note`)], { summary: row.summary }));
      properties = {};
      expect(topics).toHaveLength(count);
    });
    When("the reader loads the course", load);
    Then("the system shall display all {number} topics in the defined order {string}", (_ctx, count: number, titles: string) => {
      expect(course.topicIndex.size).toBe(count);
      // The course page lists its topics from the decorated units, not from the raw los.
      expect(course.units?.standardLos.map((lo) => lo.title)).toEqual(list(titles));
      expect(course.units?.standardLos.map((lo) => lo.type)).toEqual(Array(count).fill("topic"));
    });
    And("each topic shall show its title and its summary rendered from Markdown:", (_ctx, table: TableRow[]) => {
      const shown = [...course.topicIndex.values()].map((topic) => ({ title: topic.title, summary: topic.summary.trim() }));
      expect(shown).toEqual(table);
    });
  });

  Scenario("Topic contains units with learning objects", ({ Given, When, Then, And }) => {
    Given("a topic has {number} units, each containing {number} labs and {number} talks", (_ctx, units: number, labs: number, talks: number) => {
      const unit = (u: number) =>
        shape("unit", `Unit ${u + 1}`, [
          ...Array.from({ length: talks }, (_, t) => shape("talk", `Talk ${u + 1}.${t + 1}`)),
          ...Array.from({ length: labs }, (_, l) => labShape(`Lab ${u + 1}.${l + 1}`, [{ title: "Setup", contentMd: "# Setup" }]))
        ]);
      topics = [shape("topic", "Topic 1", Array.from({ length: units }, (_, u) => unit(u)))];
      properties = {};
    });
    When("the reader loads the course", load);
    Then("the system shall display {number} units within the topic, in the order {string}", (_ctx, count: number, titles: string) => {
      expect(firstTopic().units?.units).toHaveLength(count);
      expect(firstTopic().units?.units.map((unit) => unit.title)).toEqual(list(titles));
    });
    And("each unit shall list its learning objects by type:", (_ctx, table: TableRow[]) => {
      for (const unit of firstTopic().units!.units) {
        const listed = unit.units!.standardLos;
        for (const row of table) expect(listed.filter((lo) => lo.type === row.type)).toHaveLength(Number(row.count));
        expect(listed).toHaveLength(table.reduce((sum, row) => sum + Number(row.count), 0));
        for (const lo of listed) expect(lo.parentLo).toBe(unit);
      }
    });
  });

  Scenario("Course with frontMatter ordering", ({ Given, When, Then, And }) => {
    let orderedCount: number;

    Given("a topic holds labs with these frontMatter.order values, in authored sequence:", (_ctx, table: TableRow[]) => {
      const labs = table.map((row) => shape("lab", row.title, [], row.order.trim() === "" ? {} : { order: Number(row.order) }));
      topics = [shape("topic", "Topic 1", labs)];
      properties = {};
    });
    When("the reader loads the course", load);
    Then("the system shall sort ordered LOs first by their order value, as {string}", (_ctx, titles: string) => {
      orderedCount = list(titles).length;
      expect(firstTopic().units?.standardLos.slice(0, orderedCount).map((lo) => lo.title)).toEqual(list(titles));
    });
    And("unordered LOs shall appear after ordered ones, in authored sequence, as {string}", (_ctx, titles: string) => {
      expect(firstTopic().units?.standardLos.slice(orderedCount).map((lo) => lo.title)).toEqual(list(titles));
    });
  });

  Scenario("Course properties are applied", ({ Given, When, Then, And }) => {
    Given("a course has these properties:", (_ctx, table: TableRow[]) => {
      topics = [shape("topic", "Topic 1", [shape("note", "Note 1")])];
      properties = Object.fromEntries(table.map((row) => [row.property, propertyValue(row.value)]));
    });
    When("the reader loads the course", load);
    Then("the course shall be flagged for the portfolio layout", () => {
      expect(course.isPortfolio).toBe(true);
      // The flag is read from properties, not defaulted: the same course without it is no portfolio.
      expect(loadCourse("authored-course", "Authored Course", topics).isPortfolio).toBe(false);
    });
    And("the course shall carry the authLevel {number} for the reader to enforce", (_ctx, level: number) => {
      expect(course.authLevel).toBe(level);
    });
  });
});
