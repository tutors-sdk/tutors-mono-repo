import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import type { Composite, Course, Lo } from "../../../../packages/jsr/model/src/tutors.ts";
import { courseService } from "../../../../packages/svelte/course/src/course/services/course.svelte.ts";
import { REPO_ROOT } from "../../../../scripts/checks/lib/repo.ts";
import { courseHost, type CourseHost } from "../../support/reader-loading.ts";

// `rune()` needs the Svelte compiler; see the stub for why a plain box is a faithful stand-in.
vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../support/runes-stub.ts"));

const feature = await loadFeature("tests/bdd/features/course/course-json-history.feature");

const HISTORY = join(REPO_ROOT, "tests/fixtures/tutors-json-history");

/** What the generator wrote, before the reader decorates it: every learning object below the course. */
function written(lo: { los?: unknown[] }): Lo[] {
  return ((lo.los ?? []) as Lo[]).flatMap((child) => [child, ...written(child as Composite)]);
}

describeFeature(feature, ({ Rule }) => {
  Rule(
    "When a student opens a course whose tutors.json a published generator release wrote, the reader shall load it and reach every learning object by its route.",
    ({ RuleScenarioOutline }) => {
      RuleScenarioOutline("Open the synthetic course as generator <release> wrote it", ({ Given, When, Then, And }, variables) => {
        let host: CourseHost;
        let file: { los: unknown[] };
        let course: Course;
        // One course id per release, so the service's cache never hands one release's course to another.
        const courseId = () => `history-${variables.release.replaceAll(".", "-")}`;

        Given('the course host serves the tutors.json that generator "<release>" wrote', () => {
          const text = readFileSync(join(HISTORY, variables.release, "tutors.json"), "utf8");
          file = JSON.parse(text);
          host = courseHost();
          host.answer(courseId(), new Response(text));
        });
        When("the reader loads the course", async () => {
          courseService.courses.delete(courseId());
          course = await courseService.readCourse(courseId(), host.fetch);
        });
        Then("the course loads with the {number} topics the generator wrote", (_ctx, count: number) => {
          expect(course.courseId).toBe(courseId());
          expect(course.los.filter((lo) => lo.type === "topic").map((lo) => lo.id)).toEqual((file.los as Lo[]).filter((lo) => lo.type === "topic").map((lo) => lo.id));
          expect(course.los.filter((lo) => lo.type === "topic")).toHaveLength(count);
          // 4.x wrote the whiteboard folder as a topic inside a topic, and the reader indexes that one too.
          expect(course.topicIndex.size).toBe(written(file).filter((lo) => lo.type === "topic").length);
        });
        And("every topic and every learning object inside the course is reachable by its route", () => {
          const inside = written(file).filter((lo) => !["step", "unit", "side", "web", "github", "archive"].includes(lo.type) && !lo.route.startsWith("/video/"));
          expect(inside.length).toBeGreaterThan(15);
          for (const lo of inside) {
            const route = lo.route.replace("{{COURSEURL}}", courseId());
            // Topics are looked up in topicIndex: in loIndex a topic's route is taken over by its last unit, whose
            // route the generator writes as the topic's.
            const found = lo.type === "topic" ? course.topicIndex.get(route) : course.loIndex.get(route);
            expect(found?.id, `${lo.type} ${lo.id} at ${route}`).toBe(lo.id);
          }
        });
        And("no route in the course carries an unresolved course placeholder", () => {
          for (const lo of new Set(course.loIndex.values())) expect(lo.route, `${lo.type} ${lo.id}`).not.toContain("{{COURSEURL}}");
        });
        And("the topic {string} is hidden", (_ctx, id: string) => {
          expect(course.los.find((lo) => lo.id === id)?.hide).toBe(true);
        });
      });
    }
  );
});
