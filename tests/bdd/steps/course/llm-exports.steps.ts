import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { afterAll, expect } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { Course } from "../../../../packages/jsr/model/src/tutors.ts";
import { materialiseCourse, type LoShape } from "../../../support/arbitraries/course-tree.ts";
import { loadCourse, shape } from "../../support/course.ts";
import { generateLlms as buildDocsPage } from "../../../../apps/reader/src/routes/(course-reader)/llm/[courseid]/llms.ts";
import { generateLlms as writeDownloads } from "../../../../packages/jsr/gen/src/utils/llms.ts";

const feature = await loadFeature("tests/bdd/features/course/llm-exports.feature");

/** The one talk each topic holds, titled so that absence of the topic and of its talk read apart. */
const talkOf: Record<string, string> = { Networks: "Packet Switching", Databases: "Normalisation", Security: "Threat Models" };

describeFeature(feature, ({ Background, Rule }) => {
  let courseId: string;
  let title: string;
  let topics: LoShape[];
  let page: string;
  let servedFrom: string | undefined;
  let downloads: string;
  const tempDirs: string[] = [];

  const topicShape = (name: string) => topics.find((topic) => topic.title === name)!;
  const talkShapes = () => topics.flatMap((topic) => topic.children);

  const hideTopic = (_ctx: unknown, name: string) => {
    topicShape(name).hide = true;
  };

  const buildPage = () => {
    const course = loadCourse(courseId, title, topics) as Course;
    // The reader reads a localhost course over http (lo-tree.ts) and passes that protocol on to the page.
    if (servedFrom) course.courseUrl = servedFrom;
    page = buildDocsPage(course, undefined, servedFrom ? "http://" : "https://");
  };

  const writeFiles = () => {
    downloads = fs.mkdtempSync(path.join(os.tmpdir(), "llm-exports-"));
    tempDirs.push(downloads);
    const course = materialiseCourse({ title, summary: `${title} summary`, contentMd: `# ${title}`, children: topics });
    course.properties.llm = 1;
    writeDownloads(course as unknown as Course, downloads);
  };

  const topicFiles = () => fs.readdirSync(path.join(downloads, "llms", "topics"));
  const completeText = () => fs.readFileSync(path.join(downloads, "llms", "web-development-101-complete-llms.txt"), "utf8");

  // compressToZip is async and not awaited by the generator, so its file handles can still be
  // open when the last scenario ends; the unit tests wait the same way before removing the tree.
  afterAll(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
    tempDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
  });

  Background(({ Given, And }) => {
    Given("the generator has published the course {string} titled {string}", (_ctx, id: string, courseTitle: string) => {
      courseId = id;
      servedFrom = undefined;
      title = courseTitle;
    });
    And("the course has the topics {string}, {string} and {string}, each holding one talk", (_ctx, ...names: string[]) => {
      topics = names.map((name) => shape("topic", name, [shape("talk", talkOf[name])]));
    });
  });

  Rule("The reader shall leave a hidden learning object out of a course's LLM docs page.", ({ RuleScenario }) => {
    RuleScenario("A hidden topic is left off the page", ({ Given, When, Then, And }) => {
      Given("the topic {string} is hidden", hideTopic);
      When("the reader builds the course's LLM docs page", buildPage);
      Then("the page offers the downloads for {string} and {string}", (_ctx, first: string, second: string) => {
        expect(page).toContain(`${first.toLowerCase()}-llms.txt`);
        expect(page).toContain(`${second.toLowerCase()}-llms.txt`);
      });
      And("the page offers nothing for {string}", (_ctx, name: string) => {
        expect(page).not.toContain(name);
        expect(page).not.toContain(name.toLowerCase());
      });
    });

    RuleScenario("The page stops offering a PDF archive once every talk is hidden", ({ Given, When, Then }) => {
      Given("every talk in the course is hidden", () => {
        talkShapes().forEach((talk) => {
          talk.hide = true;
        });
      });
      When("the reader builds the course's LLM docs page", buildPage);
      Then("the page offers no course-wide PDF archive", () => {
        expect(page).toContain("web-development-101-complete-llms.txt");
        expect(page).not.toContain("web-development-101-complete-pdfs.zip");
      });
    });
  });

  Rule("When the reader builds the LLM docs page of a course it fetched over http, the reader shall link the course's downloads over http.", ({ RuleScenario }) => {
    const downloadsUnder = (_ctx: unknown, origin: string) => {
      const hrefs = [...page.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((href) => /\.(txt|zip)$/.test(href));
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect(href.startsWith(origin), href).toBe(true);
    };

    RuleScenario("A course served from localhost links its downloads on localhost", ({ Given, When, Then }) => {
      Given("the course is served over http from {string}", (_ctx, host: string) => {
        servedFrom = host;
      });
      When("the reader builds the course's LLM docs page", buildPage);
      Then("every download the page offers is under {string}", downloadsUnder);
    });

    RuleScenario("A published course keeps its https links", ({ When, Then }) => {
      When("the reader builds the course's LLM docs page", buildPage);
      Then("every download the page offers is under {string}", downloadsUnder);
    });
  });

  Rule("Tutors shall leave a hidden learning object and its descendants out of the LLM text and PDF downloads it generates.", ({ RuleScenario }) => {
    RuleScenario("A topic inside a hidden topic gets no download of its own", ({ Given, When, Then, And }) => {
      Given("the topic {string} is hidden", hideTopic);
      And("{string} holds the sub-topic {string}", (_ctx, parent: string, child: string) => {
        topicShape(parent).children.push(shape("topic", child, [shape("talk", "Index Trees")]));
      });
      When("tutors generates the course's LLM downloads", writeFiles);
      Then("there is a topic text download for {string} and for {string}", (_ctx, first: string, second: string) => {
        const files = topicFiles();
        expect(files.some((file) => file.endsWith(`-${first.toLowerCase()}-llms.txt`))).toBe(true);
        expect(files.some((file) => file.endsWith(`-${second.toLowerCase()}-llms.txt`))).toBe(true);
      });
      And("there is none for {string} or for {string}", (_ctx, hidden: string, descendant: string) => {
        const files = topicFiles();
        expect(files.filter((file) => file.includes(hidden.toLowerCase()))).toEqual([]);
        expect(files.filter((file) => file.includes(descendant.toLowerCase()))).toEqual([]);
      });
    });

    RuleScenario("A hidden topic's content stays out of the course-wide download", ({ Given, When, Then, And }) => {
      Given("the topic {string} is hidden", hideTopic);
      When("tutors generates the course's LLM downloads", writeFiles);
      Then("the course-wide text download holds the content of {string}", (_ctx, name: string) => {
        expect(completeText()).toContain(name);
        expect(completeText()).toContain(talkOf[name]);
      });
      And("it holds nothing of {string} or of the talk inside it", (_ctx, name: string) => {
        expect(completeText()).not.toContain(name);
        expect(completeText()).not.toContain(talkOf[name]);
      });
    });
  });
});
