import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import type { Composite, Course, Lab, Lo } from "../../../../packages/jsr/model/src/tutors.ts";
import { courseService } from "../../../../packages/svelte/course/src/course/services/course.svelte.ts";
import { markdownService } from "../../../../packages/svelte/course/src/markdown/index.ts";
import { courseProtocol } from "../../../../packages/svelte/runes/src/index.svelte.ts";
import type { LeafType, LoShape } from "../../../support/arbitraries/course-tree.ts";
import { indexedLos, labShape, loadCourse, shape } from "../../support/course.ts";
import { courseHost, publishedCourseJson, type CourseHost } from "../../support/reader-loading.ts";

// `rune()` needs the Svelte compiler; see the stub for why a plain box is a faithful stand-in.
vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../support/runes-stub.ts"));

const feature = await loadFeature("tests/bdd/features/course/course-loading.feature");

describeFeature(feature, ({ Background, BeforeEachScenario, Rule }) => {
  let courseId: string;
  let title: string;
  let topics: LoShape[];
  let course: Course;
  let calendar: Record<string, unknown> | undefined;

  const firstTopic = () => course.los[0] as Composite;
  const load = () => {
    course = loadCourse(courseId, title, topics, {}, calendar);
  };

  // Rules 0659 and 0660 open the course through the reader's course service, over this host.
  // Only the course cache is emptied between scenarios: the shared protocol is left as the last
  // scenario set it, so a course opened earlier can leak its protocol here exactly as in a session.
  let host: CourseHost;
  BeforeEachScenario(() => {
    courseService.courses.clear();
    host = courseHost();
  });
  const open = async (_ctx: unknown, address: string) => {
    host.answerEverywhere(new Response(publishedCourseJson(title, topics)));
    course = (await courseService.readCourse(address, host.fetch)) as unknown as Course;
  };
  const courseImage = (_ctx: unknown, image: string) => {
    expect(course.img).toBe(image);
  };
  const lastRequested = (_ctx: unknown, url: string) => {
    expect(host.requested.at(-1)).toBe(url);
  };
  const firstLabShowsImage = (_ctx: unknown, image: string) => {
    const lab = topics[0].children[0];
    lab.steps[0].contentMd += `\n\n![diagram](${image})`;
  };
  const labImagesServedFrom = (_ctx: unknown, prefix: string) => {
    const lab = firstTopic().los.find((lo) => lo.type === "lab") as Lab;
    markdownService.convertLabToHtml(course as never, lab as never);
    const sources = lab.los.flatMap((step) => [...step.contentHtml.matchAll(/src="([^"]+)"/g)].map((match) => match[1]));
    expect(sources).not.toHaveLength(0);
    for (const source of sources) expect(source.startsWith(prefix), source).toBe(true);
  };
  const downloadsOver = (_ctx: unknown, protocol: string) => {
    // The llms page builds the course's download links on this protocol (llm/[courseid]/+page.ts).
    expect(courseProtocol.value).toBe(protocol);
  };

  // The Background runs before every scenario, so each one starts from a freshly published course.
  Background(({ Given, And }) => {
    Given("the generator has published the course {string} titled {string}", (_ctx, id: string, courseTitle: string) => {
      courseId = id;
      title = courseTitle;
      calendar = undefined;
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

  Rule("Where a course's calendar.yaml lists at least one week, the reader shall load that course's calendar.", ({ RuleScenario }) => {
    const givenCalendar = (_ctx: unknown, calendarTitle: string, weekCount: number) => {
      calendar = {
        title: calendarTitle,
        year: 2026,
        weeks: Array.from({ length: weekCount }, (_, w) => ({ date: `2026-09-${String(7 + 7 * w).padStart(2, "0")}`, week: w + 1, topic: `Week ${w + 1}` }))
      };
    };
    const noCalendar = () => {
      expect(course.courseCalendar).toBeUndefined();
    };

    RuleScenario("A calendar with weeks is loaded", ({ Given, When, Then }) => {
      Given("the course has a calendar.yaml titled {string} with {number} weeks", givenCalendar);
      When("the reader loads the course", load);
      Then("the course should have the calendar {string} with {number} weeks", (_ctx, calendarTitle: string, weekCount: number) => {
        expect(course.courseCalendar?.title).toBe(calendarTitle);
        expect(course.courseCalendar?.weeks.map((week) => week.title)).toEqual(Array.from({ length: weekCount }, (_, w) => `Week ${w + 1}`));
      });
    });

    RuleScenario("A course with no calendar.yaml has no calendar", ({ When, Then }) => {
      When("the reader loads the course", load);
      Then("the course should have no calendar", noCalendar);
    });

    RuleScenario("A calendar.yaml with no weeks has no calendar", ({ Given, When, Then }) => {
      Given("the course has a calendar.yaml titled {string} with {number} weeks", givenCalendar);
      When("the reader loads the course", load);
      Then("the course should have no calendar", noCalendar);
    });
  });

  Rule("When a student opens a course by its id, its host name or its full URL, the reader shall fetch that course's tutors.json once, from the one URL the address names.", ({ RuleScenarioOutline }) => {
    RuleScenarioOutline("Each form of a course address names one tutors.json", ({ When, Then, And }, variables) => {
      When("a student opens the course at \"<address>\" twice", async (ctx) => {
        await open(ctx, variables.address);
        await open(ctx, variables.address);
      });
      Then("the reader shall have requested only \"<url>\"", () => {
        expect(host.requested).toEqual([variables.url]);
      });
      And("the course shall have the id \"<id>\"", () => {
        expect(course.courseId).toBe(variables.id);
        expect(courseService.courses.get(variables.id)).toBe(course);
      });
      And("the course image shall be \"<image>\"", (ctx) => courseImage(ctx, variables.image));
    });
  });

  Rule("When a student opens a course after another course, the reader shall fetch and link that course over the protocol of its own address.", ({ RuleScenario }) => {
    RuleScenario("A hosted course opened after a local course is served over https", ({ Given, When, Then, And }) => {
      Given("the first lab shows the image {string}", firstLabShowsImage);
      And("a student has opened the course at {string}", open);
      When("a student opens the course at {string}", open);
      Then("the reader shall last have requested {string}", lastRequested);
      And("the course image shall be {string}", courseImage);
      And("every image in the first lab shall be served from {string}", labImagesServedFrom);
      And("the reader shall link the course's downloads over {string}", downloadsOver);
    });

    RuleScenario("A local course opened after a hosted course is served over http", ({ Given, When, Then, And }) => {
      Given("the first lab shows the image {string}", firstLabShowsImage);
      And("a student has opened the course at {string}", open);
      When("a student opens the course at {string}", open);
      Then("the reader shall last have requested {string}", lastRequested);
      And("the course image shall be {string}", courseImage);
      And("every image in the first lab shall be served from {string}", labImagesServedFrom);
      And("the reader shall link the course's downloads over {string}", downloadsOver);
    });

    RuleScenario("A hosted course reopened from the cache after a local course keeps https", ({ Given, When, Then, And }) => {
      Given("the first lab shows the image {string}", firstLabShowsImage);
      And("a student has opened the course at {string}", open);
      And("a student has then opened the course at {string}", open);
      When("a student opens the course at {string}", open);
      Then("the reader shall have requested {number} URLs", (_ctx, count: number) => {
        expect(host.requested).toHaveLength(count);
      });
      And("every image in the first lab shall be served from {string}", labImagesServedFrom);
      And("the reader shall link the course's downloads over {string}", downloadsOver);
    });
  });
});
