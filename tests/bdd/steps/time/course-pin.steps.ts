import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { afterAll, expect, vi } from "vitest";
import { CourseTime } from "../../../../packages/jsr/time/src/services/course-time.ts";

const feature = await loadFeature("tests/bdd/features/time/course-pin.feature");

describeFeature(feature, ({ Rule }) => {
  let publishedPin: string;
  let fetchMock: ReturnType<typeof vi.fn>;
  let pin: string;

  afterAll(() => vi.unstubAllGlobals());

  function coursePublishesPin(_ctx: unknown, _courseId: string, published: string) {
    publishedPin = published;
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ properties: { ignorepin: publishedPin } }) });
    vi.stubGlobal("fetch", fetchMock);
  }

  async function instructorOpensCourse(_ctx: unknown, courseId: string) {
    pin = await CourseTime.getCoursePin(courseId);
  }

  function readsPinFrom(_ctx: unknown, url: string) {
    expect(fetchMock).toHaveBeenCalledWith(url);
  }

  function coursePinIs(_ctx: unknown, expected: string) {
    expect(pin).toBe(expected);
  }

  Rule("When an instructor opens a course, the time dashboard shall read the course PIN from the tutors.json of the host that serves the course.", ({ RuleScenario }) => {
    for (const title of [
      "A course served from its own domain",
      "A course id with no domain is served from Netlify",
      "A course served from a local machine"
    ]) {
      RuleScenario(title, ({ Given, When, Then, And }) => {
        Given("the course {string} publishes the PIN {string} in its tutors.json", coursePublishesPin);
        When("an instructor opens the course {string} in the time dashboard", instructorOpensCourse);
        Then("the time dashboard shall read the PIN from {string}", readsPinFrom);
        And("the course PIN shall be {string}", coursePinIs);
      });
    }
  });
});
