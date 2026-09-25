import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import type { Course, Lab, Lo } from "../../../../packages/jsr/model/src/tutors.ts";
import type { LiveLab } from "../../../../packages/svelte/course/src/course/services/live-lab.ts";
import { labShape, shape } from "../../support/course.ts";
import { followCrumb, labTitled, loadPublishedCourse, openLab } from "../../support/reader.ts";

const feature = await loadFeature("tests/bdd/features/student/lab-interaction.feature");

const list = (csv: string) => csv.split(",").map((item) => item.trim());

describeFeature(feature, ({ Background, Scenario }) => {
  let courseId: string;
  let courseTitle: string;
  let topicTitle: string;
  let labTitle: string;
  let steps: { title: string; contentMd: string }[];
  let pdfFile: string;
  let course: Course;
  let lab: Lab;
  let live: LiveLab;

  const giveLabSteps = (_ctx: unknown, count: number) => {
    steps = Array.from({ length: count }, (_, s) => ({ title: `Step ${s + 1}`, contentMd: `# Step ${s + 1}\n\nInstructions for step ${s + 1}.` }));
  };
  // Publishes the lab as the generator would, PDF included, then opens it as the reader's lab route does.
  const open = () => {
    course = loadPublishedCourse(courseId, courseTitle, [shape("topic", topicTitle, [labShape(labTitle, steps)])], (raw) => {
      const rawLab = raw.los[0].los![0];
      if (pdfFile) {
        rawLab.pdf = `https://{{COURSEURL}}/topic-0/lab-0/${pdfFile}`;
        rawLab.pdfFile = pdfFile;
      }
    });
    lab = labTitled(course, labTitle);
    live = openLab(course, lab);
    live.setFirstPageActive();
  };
  // Steps are addressed in the URL by their short title, which is what the lab route hands to setActivePage.
  const stepKey = (stepTitle: string) => {
    const step = lab.los.find((lo) => lo.title === stepTitle);
    if (!step) throw new Error(`the lab has no step titled "${stepTitle}"`);
    return encodeURI(step.shortTitle);
  };
  const navItems = () => [...live.navbarHtml.matchAll(/<li><a [^>]*href="([^"]*)"( aria-current="step")?>([^<]*)<\/a><\/li>/g)];
  const expectStepDisplayed = (_ctx: unknown, stepTitle: string) => {
    const number = stepTitle.replace("Step ", "");
    expect(live.currentChapterTitle).toBe(stepTitle);
    expect(live.content).toContain(`>${stepTitle}</a></h1>`);
    expect(live.content).toContain(`<p>Instructions for step ${number}.</p>`);
  };

  Background(({ Given, And }) => {
    Given("the generator has published the course {string} titled {string}", (_ctx, id: string, title: string) => {
      courseId = id;
      courseTitle = title;
      pdfFile = "";
    });
    And("the topic {string} holds the lab {string}", (_ctx, topic: string, labName: string) => {
      topicTitle = topic;
      labTitle = labName;
    });
  });

  Scenario("Navigate through lab steps", ({ Given, When, Then, And }) => {
    Given("the lab has {number} steps", giveLabSteps);
    When("a student opens the lab", open);
    Then("the system shall display the content for the step {string}", expectStepDisplayed);
    And("the system shall show a navigation panel with the step titles {string}", (_ctx, expected: string) => {
      expect(navItems().map((item) => item[3])).toEqual(list(expected));
      expect(navItems().map((item) => item[1])).toEqual(lab.los.map((step) => `${lab.route}/${step.shortTitle}`));
    });
  });

  Scenario("Move between lab steps", ({ Given, And, When, Then }) => {
    Given("the lab has {number} steps", giveLabSteps);
    And("a student is on the step {string}", (_ctx, stepTitle: string) => {
      open();
      live.setActivePage(stepKey(stepTitle));
      expect(live.currentChapterTitle).toBe(stepTitle);
    });
    When("the student moves to the step {string}", (_ctx, stepTitle: string) => {
      live.setActivePage(stepKey(stepTitle));
    });
    Then("the system shall display the content for the step {string}", expectStepDisplayed);
    And("the step navigation shall mark only {string} as the current step", (_ctx, stepTitle: string) => {
      const current = navItems().filter((item) => item[2] !== undefined);
      expect(current.map((item) => item[3])).toEqual([stepTitle]);
    });
    And("the step navigation shall offer {string} as previous and {string} as next", (_ctx, previous: string, next: string) => {
      expect(live.prevStep()).toBe(stepKey(previous));
      expect(live.nextStep()).toBe(stepKey(next));
      const links = [...live.horizontalNavbarHtml.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
      expect(links).toEqual([`${lab.route}/${stepKey(previous)}`, `${lab.route}/${stepKey(next)}`]);
    });
  });

  Scenario("View lab with mixed content types", ({ Given, When, Then, And }) => {
    Given("a lab step contains markdown with a fenced {string} code block", (_ctx, language: string) => {
      steps = [{ title: "Variables", contentMd: ["# Variables", "", "Declare a **constant**.", "", "```" + language, "const x = 42;", "```"].join("\n") }];
    });
    When("a student opens the lab", open);
    Then("the system shall render the markdown heading and paragraph as HTML", () => {
      expect(live.content).toContain(`<h1 id="variables" tabindex="-1"><a class="header-anchor" href="#variables">Variables</a></h1>`);
      expect(live.content).toContain("<p>Declare a <strong>constant</strong>.</p>");
      expect(live.content).not.toContain("```");
    });
    And("the system shall mark the code block with the language {string} for highlighting", (_ctx, language: string) => {
      expect(live.content).toContain(`<pre><code class="language-${language}">const x = 42;\n</code></pre>`);
    });
  });

  Scenario("Navigate via breadcrumbs", ({ Given, And, When, Then }) => {
    let arrived: Lo | undefined;
    Given("the lab has {number} steps", giveLabSteps);
    And("a student is viewing the lab", open);
    When("the student follows the breadcrumb {string}", (_ctx, crumbTitle: string) => {
      arrived = followCrumb(course, lab, crumbTitle);
    });
    Then("the system shall navigate back to the topic {string} at {string}", (_ctx, expectedTitle: string, route: string) => {
      expect(arrived?.type).toBe("topic");
      expect(arrived?.title).toBe(expectedTitle);
      expect(arrived?.route).toBe(route);
      expect(arrived).toBe(lab.parentLo);
    });
  });

  Scenario("View lab PDF companion", ({ Given, And, When, Then }) => {
    Given("the lab has {number} steps", giveLabSteps);
    And("the lab was published with the PDF file {string}", (_ctx, file: string) => {
      pdfFile = file;
    });
    When("a student opens the lab", open);
    Then("the system shall link to the PDF at {string}", (_ctx, url: string) => {
      // The lab page shows its PDF link exactly when `lab.pdf` is set.
      expect(live.lab.pdf).toBe(url);
    });
  });
});
