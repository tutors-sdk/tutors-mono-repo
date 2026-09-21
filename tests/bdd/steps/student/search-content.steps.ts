import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { searchHits, type Course, type ResultType } from "../../../../packages/jsr/model/src/tutors.ts";
import type { LoShape } from "../../../support/arbitraries/course-tree.ts";
import { labShape, loadCourse, shape } from "../../support/course.ts";
import { searchableLos } from "../../support/reader.ts";

const feature = await loadFeature("tests/bdd/features/student/search-content.feature");

const list = (csv: string) => csv.split(",").map((item) => item.trim());

describeFeature(feature, ({ Background, Rule }) => {
  let courseId: string;
  let title: string;
  let los: LoShape[];
  let course: Course;
  let results: ResultType[];

  // The course is loaded at search time, so each scenario's Given steps can still add to it.
  const search = (_ctx: unknown, term: string) => {
    course = loadCourse(courseId, title, [shape("topic", "Topic 1", los)]);
    results = searchHits(searchableLos(course), term);
  };
  const addLabsWithLine = (_ctx: unknown, labCount: number, line: string) => {
    for (let l = 1; l <= labCount; l++) los.push(labShape(`Lab ${l}`, [{ title: "Read", contentMd: `# Read\n\n${line}\n\nCarry on.` }]));
  };
  // The reader renders each hit as markdown, so the newline that search keeps in front of a line is not significant.
  const matchingLines = () => results.map((result) => result.contentMd.trim());

  Background(({ Given }) => {
    Given("the generator has published the course {string} titled {string}", (_ctx, id: string, courseTitle: string) => {
      courseId = id;
      title = courseTitle;
      los = [];
    });
  });

  Rule("When a student searches a course, the reader shall list each matching line with the learning object it comes from.", ({ RuleScenario }) => {
    RuleScenario("Search for a term in course content", ({ Given, And, When, Then }) => {
      Given("the course has {number} labs whose only step includes the line {string}", addLabsWithLine);
      And("the course has a note that includes the line {string}", (_ctx, line: string) => {
        los.push(shape("note", "Reference", [], { contentMd: `# Reference\n\n${line}\n\nThe end.` }));
      });
      When("a student searches for {string}", search);
      Then("the reader shall return {number} results from {number} different learning objects", (_ctx, count: number, loCount: number) => {
        expect(results).toHaveLength(count);
        expect(new Set(results.map((result) => result.lab)).size).toBe(loCount);
        expect(results.map((result) => result.lab.type)).toEqual(["step", "step", "step", "note"]);
      });
      And("the results shall show the matching lines {string}", (_ctx, expected: string) => {
        expect(matchingLines()).toEqual(list(expected));
      });
    });
  });

  Rule("When a student searches for text in a fenced code block, the reader shall mark the result as fenced code and give its language.", ({ RuleScenario }) => {
    RuleScenario("Search finds content in fenced code blocks", ({ Given, When, Then, And }) => {
      Given("a lab step contains a fenced {string} code block with {string}", (_ctx, language: string, code: string) => {
        const contentMd = ["# Variables", "", "Declare a constant.", "", "```" + language, code, "```", "", "Done."].join("\n");
        los.push(labShape("Lab 1", [{ title: "Variables", contentMd }]));
      });
      When("a student searches for {string}", search);
      Then("the reader shall return {number} result", (_ctx, count: number) => {
        expect(results).toHaveLength(count);
        expect(matchingLines()).toEqual(["const x = 42;"]);
      });
      And("the result shall indicate the match is within fenced code", () => {
        expect(results[0].fenced).toBe(true);
      });
      And("the result shall include the code language {string}", (_ctx, language: string) => {
        expect(results[0].language).toBe(language);
      });
      And("a search for {string} shall return {number} result outside fenced code", (_ctx, term: string, count: number) => {
        const prose = searchHits(searchableLos(course), term);
        expect(prose).toHaveLength(count);
        expect(prose.map((result) => [result.fenced, result.language])).toEqual([[false, ""]]);
      });
    });
  });

  Rule("When a student searches a course, the reader shall return at most 100 results.", ({ RuleScenario }) => {
    RuleScenario("Search results are limited", ({ Given, When, Then, And }) => {
      let labCount: number;
      let stepCount: number;
      Given("the course has {number} labs of {number} steps that each mention {string} once", (_ctx, labs: number, steps: number, term: string) => {
        labCount = labs;
        stepCount = steps;
        for (let l = 1; l <= labs; l++) {
          los.push(
            labShape(
              `Lab ${l}`,
              Array.from({ length: steps }, (_, s) => ({ title: `Step ${s + 1}`, contentMd: `# Step ${s + 1}\n\nAssign the ${term} here.\n` }))
            )
          );
        }
      });
      When("a student searches for {string}", search);
      Then("the reader shall return at most {number} results", (_ctx, limit: number) => {
        // More matches exist than the limit allows, so the limit is what holds the count down.
        expect(labCount * stepCount).toBeGreaterThan(limit);
        expect(results).toHaveLength(limit);
      });
      And("the results shall be from across {number} different labs", (_ctx, count: number) => {
        expect(new Set(results.map((result) => result.lab.parentLo)).size).toBe(count);
      });
    });
  });

  Rule("When a student searches for text that no learning object contains, the reader shall return an empty result set.", ({ RuleScenario }) => {
    RuleScenario("Search with no results", ({ Given, When, Then }) => {
      Given("the course has {number} labs whose only step includes the line {string}", addLabsWithLine);
      When("a student searches for {string}", search);
      Then("the reader shall return an empty result set", () => {
        expect(results).toEqual([]);
      });
    });
  });

  Rule("When a student searches a course, the reader shall give each result a link that leads to the step that matched.", ({ RuleScenario }) => {
    RuleScenario("Search result links navigate to content", ({ Given, When, Then, And }) => {
      Given("the course has {number} labs whose only step includes the line {string}", addLabsWithLine);
      When("a student searches for {string}", search);
      Then("each result link shall be {string}", (_ctx, link: string) => {
        expect(results.map((result) => result.link)).toEqual([link]);
      });
      And("the link route shall not start with a hash character", () => {
        for (const result of results) expect(result.link.startsWith("#")).toBe(false);
      });
      And("the link shall lead the reader to the step that matched", () => {
        // The search page puts the leading slash back before it renders the link.
        for (const result of results) {
          const target = course.loIndex.get(`/${result.link}`);
          expect(target?.type).toBe("step");
          expect(target).toBe(result.lab);
        }
      });
    });
  });
});
