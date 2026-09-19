import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect, vi } from "vitest";
import { courseService } from "../../../../packages/svelte/course/src/course/services/course.svelte.ts";
import { captureLogs, courseHost, publishedCourseJson, type CourseHost, type LogCapture } from "../../support/reader-loading.ts";

// `rune()` needs the Svelte compiler; see the stub for why a plain box is a faithful stand-in.
vi.mock("../../../../packages/svelte/runes/src/index.svelte.ts", () => import("../../support/runes-stub.ts"));

const feature = await loadFeature("tests/bdd/features/shared/offline-resilience.feature");

describeFeature(feature, ({ BeforeEachScenario, AfterEachScenario, Scenario }) => {
  let host: CourseHost;
  let logs: LogCapture;

  BeforeEachScenario(() => {
    courseService.courses.clear();
    host = courseHost();
    logs = captureLogs();
  });

  AfterEachScenario(() => {
    logs.stop();
  });

  Scenario("Failed API call does not corrupt local state", ({ Given, When, And, Then }) => {
    Given("the reader has loaded the course {string} titled {string}", async (_ctx, courseId: string, title: string) => {
      host.answer(courseId, new Response(publishedCourseJson(title)));
      const course = await courseService.readCourse(courseId, host.fetch);
      expect(course.title).toBe(title);
    });
    When("the network becomes unavailable", () => {
      host.goOffline();
    });
    And("the reader fails to load the course {string}", async (_ctx, courseId: string) => {
      await expect(courseService.readCourse(courseId, host.fetch)).rejects.toThrow("Failed to fetch");
      expect(logs.errors().map((entry) => entry.message)).toContain(`Error fetching from URL: https://${courseId}.netlify.app/tutors.json`);
    });
    Then("the reader shall still serve {string} titled {string} without a network request", async (_ctx, courseId: string, title: string) => {
      const requestsBefore = host.requested.length;
      const course = await courseService.readCourse(courseId, host.fetch);
      expect(course.title).toBe(title);
      expect(course.courseId).toBe(courseId);
      expect(host.requested).toHaveLength(requestsBefore);
    });
    And("the reader shall hold exactly {number} course in its cache", (_ctx, count: number) => {
      expect(courseService.courses.size).toBe(count);
    });
    And("the reader shall still open the topic {string} of {string}", async (_ctx, topicTitle: string, courseId: string) => {
      const course = await courseService.readCourse(courseId, host.fetch);
      const [topicRoute] = [...course.topicIndex.keys()];
      const topic = await courseService.readTopic(courseId, topicRoute, host.fetch);
      expect(topic.type).toBe("topic");
      expect(topic.title).toBe(topicTitle);
    });
  });
});
