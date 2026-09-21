import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { searchHits, type Composite, type Course, type Lab, type Lo, type ResultType } from "../../../../packages/jsr/model/src/tutors.ts";
import type { LoShape } from "../../../support/arbitraries/course-tree.ts";
import { labShape, loadCourse, shape } from "../../support/course.ts";
import { followCrumb, labTitled, searchableLos } from "../../support/reader.ts";

const feature = await loadFeature("tests/bdd/features/course/course-navigation.feature");

const list = (csv: string) => csv.split(",").map((item) => item.trim());

describeFeature(feature, ({ Background, Rule }) => {
  let courseId: string;
  let title: string;
  let topics: LoShape[];
  let course: Course;
  let arrived: Lo | undefined;

  const holdTopic = (_ctx: unknown, topicTitle: string, labTitle: string, noteTitle: string) => {
    topics.push(
      shape("topic", topicTitle, [
        labShape(labTitle, [{ title: "Build", contentMd: `# Build ${labTitle}\n\nFollow along.` }]),
        shape("note", noteTitle, [], { contentMd: `# ${noteTitle}\n\nKeep this to hand.` })
      ])
    );
  };
  const crumbTrail = (lo: Lo) => lo.breadCrumbs?.map((crumb) => crumb.title).join(" > ");
  const tocTitles = (lo: Lo) => (lo as Composite).toc.map((entry) => entry.title);

  Background(({ Given, And }) => {
    Given("the generator has published the course {string} titled {string}", (_ctx, id: string, courseTitle: string) => {
      courseId = id;
      title = courseTitle;
      topics = [];
      arrived = undefined;
    });
    And("the topic {string} holds the lab {string} and the note {string}", holdTopic);
    And("the next topic {string} holds the lab {string} and the note {string}", holdTopic);
    And("the reader has loaded the course", () => {
      course = loadCourse(courseId, title, topics);
    });
  });

  Rule("When a student follows a topic route, the reader shall show that topic with its learning objects and its breadcrumb trail.", ({ RuleScenario }) => {
    RuleScenario("Navigate from course to topic", ({ When, Then, And }) => {
      When("I follow the route {string}", (_ctx, route: string) => {
        arrived = course.topicIndex.get(route);
      });
      Then("I should arrive at the topic {string}", (_ctx, expected: string) => {
        expect(arrived?.type).toBe("topic");
        expect(arrived?.title).toBe(expected);
      });
      And("the topic should list the learning objects {string}", (_ctx, expected: string) => {
        expect(tocTitles(arrived!)).toEqual(list(expected));
      });
      And("the breadcrumb should show {string}", (_ctx, expected: string) => {
        expect(crumbTrail(arrived!)).toBe(expected);
      });
    });
  });

  Rule("When a student follows a lab route, the reader shall show that lab with its first step and its breadcrumb trail.", ({ RuleScenario }) => {
    RuleScenario("Navigate from topic to lab", ({ When, Then, And }) => {
      When("I follow the route {string}", (_ctx, route: string) => {
        arrived = course.loIndex.get(route);
      });
      Then("I should arrive at the lab {string}", (_ctx, expected: string) => {
        expect(arrived?.type).toBe("lab");
        expect(arrived?.title).toBe(expected);
      });
      And("the first lab step should be rendered with the heading {string}", (_ctx, heading: string) => {
        const html = (arrived as Lab).los[0].contentHtml;
        expect(html).toMatch(new RegExp(`^<h1[^>]*>.*>${heading}</a></h1>\\n<p>Follow along\\.</p>\\n$`));
      });
      And("the breadcrumb should show {string}", (_ctx, expected: string) => {
        expect(crumbTrail(arrived!)).toBe(expected);
      });
    });
  });

  Rule("When a student searches within a course, the reader shall list each matching learning object with its title and type.", ({ RuleScenario }) => {
    RuleScenario("Search for content within a course", ({ When, Then, And }) => {
      let results: ResultType[];
      When("I search for {string}", (_ctx, term: string) => {
        results = searchHits(searchableLos(course), term);
      });
      Then("I should see {number} matching learning objects", (_ctx, count: number) => {
        expect(new Set(results.map((result) => result.lab)).size).toBe(count);
        expect(results).toHaveLength(count);
      });
      And("the results should be titled {string}", (_ctx, expected: string) => {
        expect(results.map((result) => result.title)).toEqual(list(expected));
      });
      And("the results should carry the learning object types {string}", (_ctx, expected: string) => {
        expect(results.map((result) => result.lab.type)).toEqual(list(expected));
      });
    });
  });

  Rule("When a student follows a breadcrumb, the reader shall show the topic that the breadcrumb names with its learning objects.", ({ RuleScenario }) => {
    RuleScenario("Navigate back using breadcrumbs", ({ Given, When, Then, And }) => {
      let viewing: Lo;
      Given("I am viewing the lab {string}", (_ctx, labTitle: string) => {
        viewing = labTitled(course, labTitle);
      });
      When("I follow the breadcrumb {string}", (_ctx, crumbTitle: string) => {
        arrived = followCrumb(course, viewing, crumbTitle);
      });
      Then("I should arrive at the topic {string}", (_ctx, expected: string) => {
        expect(arrived?.type).toBe("topic");
        expect(arrived?.title).toBe(expected);
        expect(arrived).toBe(viewing.parentLo);
      });
      And("the topic should list the learning objects {string}", (_ctx, expected: string) => {
        expect(tocTitles(arrived!)).toEqual(list(expected));
      });
    });
  });
});
