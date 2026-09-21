import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import type { MockSupabaseClient } from "../../support/mocks.ts";

// Supabase is the only stand-in: the catalogue service and the catalogue page's load function are the real ones.
vi.mock("../../../../packages/svelte/community/src/utils/supabase-client.ts", async () => {
  const { MockSupabaseClient } = await import("../../support/mocks.ts");
  return { supabase: new MockSupabaseClient() };
});
// The catalogue app imports the service from the package index, which also pulls in rune-based services
// that need the Svelte compiler. Point the index at the real catalogue service alone.
vi.mock("../../../../packages/svelte/community/src/index.ts", async () => await import("../../../../packages/svelte/community/src/services/catalogue.ts"));

import { flattenLos, type Composite, type Course, type Lo } from "../../../../packages/jsr/model/src/tutors.ts";
import { supabase } from "../../../../packages/svelte/community/src/utils/supabase-client.ts";
import { load as loadCataloguePage } from "../../../../apps/catalogue/src/routes/+page.ts";
import type { LoShape } from "../../../support/arbitraries/course-tree.ts";
import { labShape, loadCourse, shape } from "../../support/course.ts";

const feature = await loadFeature("tests/bdd/features/student/course-discovery.feature");

const list = (csv: string) => csv.split(",").map((item) => item.trim());

type CatalogueRow = { id: string; title: string; visits: string };
type CourseRecord = { id: string; title: string; credits: string; img: string; visits: number };

describeFeature(feature, ({ Rule }) => {
  Rule("When a student opens the catalogue, the catalogue shall list the courses with at least 20 visits, most visited first, each with its title, summary, image and visit count.", ({ RuleScenario }) => {
    RuleScenario("Browse available courses in catalogue", ({ Given, When, Then, And }) => {
      let rows: CatalogueRow[];
      let displayed: CourseRecord[];

      const record = (row: CatalogueRow) => ({ id: row.id, title: row.title, credits: `${row.title} team`, img: `https://${row.id}.netlify.app/course.png` });

      Given("the catalogue contains the courses:", (_ctx, table: CatalogueRow[]) => {
        rows = table;
        (supabase as unknown as MockSupabaseClient).setTableData(
          "tutors-connect-courses",
          rows.map((row, i) => ({
            course_id: row.id,
            visited_at: `2026-09-0${i + 1}T09:00:00Z`,
            visit_count: Number(row.visits),
            course_record: record(row)
          }))
        );
      });
      When("a student opens the catalogue", async () => {
        const data = (await loadCataloguePage({ fetch } as Parameters<typeof loadCataloguePage>[0])) as { courseRecords: CourseRecord[] };
        displayed = data.courseRecords;
      });
      Then("the catalogue shall display the courses {string}", (_ctx, expected: string) => {
        // Established courses only (20 visits or more), most visited first.
        expect(displayed.map((course) => course.title)).toEqual(list(expected));
      });
      And("each course shall show its title, summary, image and visit count", () => {
        for (const course of displayed) {
          const row = rows.find((candidate) => candidate.id === course.id)!;
          // The catalogue card takes its summary from the course credits.
          expect(course).toEqual({ ...record(row), visits: Number(row.visits) });
        }
      });
    });
  });

  Rule("When a student filters a course by topic, the reader shall show only the learning objects of that topic.", ({ RuleScenario }) => {
    RuleScenario("Filter courses by topic", ({ Given, When, Then }) => {
      let course: Course;
      let shown: Lo[];

      Given("a course has topics {string} and {string}", (_ctx, first: string, second: string) => {
        const topic = (title: string): LoShape =>
          shape("topic", title, [labShape(`${title} Lab`, [{ title: "Setup", contentMd: "# Setup" }]), shape("note", `${title} Notes`)]);
        course = loadCourse("computing", "Computing", [topic(first), topic(second)]);
      });
      When("a student filters by topic {string}", (_ctx, topicTitle: string) => {
        const topics = [...course.topicIndex.values()].filter((topic) => topic.title === topicTitle);
        expect(topics).toHaveLength(1);
        shown = flattenLos(topics[0].los);
      });
      Then("the reader shall display only the learning objects {string}", (_ctx, expected: string) => {
        expect(shown.map((lo) => lo.title)).toEqual(list(expected));
      });
    });
  });

  Rule("When a student opens a course, the reader shall display its title, its summary and its topics in their published order.", ({ RuleScenario }) => {
    RuleScenario("View course details", ({ Given, And, When, Then }) => {
      let title: string;
      let topics: LoShape[];
      let course: Course;

      Given("a course {string} exists", (_ctx, courseTitle: string) => {
        title = courseTitle;
      });
      And("its topics {string} were published with the orders {string}", (_ctx, titles: string, orders: string) => {
        const order = list(orders);
        topics = list(titles).map((topicTitle, i) => shape("topic", topicTitle, [], order[i] === "none" ? {} : { order: Number(order[i]) }));
      });
      When("a student navigates to the course", () => {
        course = loadCourse("intro-computing", title, topics);
      });
      Then("the reader shall display the course title {string} and the summary {string}", (_ctx, expectedTitle: string, summaryHtml: string) => {
        expect(course.title).toBe(expectedTitle);
        expect(course.summary.trim()).toBe(summaryHtml);
      });
      And("the reader shall display the topics in the order {string}", (_ctx, expected: string) => {
        const composite = course as unknown as Composite;
        expect(composite.units.standardLos.map((lo) => lo.title)).toEqual(list(expected));
        expect(composite.toc.map((lo) => lo.title)).toEqual(list(expected));
      });
    });
  });
});
