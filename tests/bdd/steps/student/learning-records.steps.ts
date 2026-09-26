import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { labShape, loadCourse, shape } from "../../support/course.ts";
import type { Course, Lo } from "../../../../packages/jsr/model/src/tutors.ts";
import { createLrsClient, createStatementRecorder, experiencedStatement, type XapiStatement } from "../../../../packages/svelte/utils/xapi/src/index.ts";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const feature = await loadFeature("tests/bdd/features/student/learning-records.feature");

const ENDPOINT = "http://lrs.test/xapi";
const KEY = "tutors-key";
const SECRET = "tutors-secret";

describeFeature(feature, ({ Background, Rule }) => {
  let course: Course;
  let statement: XapiStatement;
  let requests: { url: string; init: FetchInit }[];
  let consenting: Set<string>;

  // The seam: the store's HTTP endpoint. Everything in front of it is product code.
  const storeFetch = (async (url: string, init: FetchInit) => {
    requests.push({ url, init });
    const sent = JSON.parse(String(init.body)) as unknown[];
    return new Response(JSON.stringify(sent.map((_, i) => `id-${requests.length}-${i}`)), { status: 200 });
  }) as typeof fetch;

  const lab = (n: number): Lo => [...new Set(course.loIndex.values())].filter((lo) => lo.type === "lab")[n - 1];
  const sentStatements = () => requests.flatMap((r) => JSON.parse(String(r.init.body)) as XapiStatement[]);
  const opens = (_ctx: unknown, login: string, n: number) => {
    const lo = lab(n);
    statement = experiencedStatement({
      activityBase: "https://tutors.dev",
      courseId: course.courseId,
      courseTitle: course.title,
      loRoute: lo.route,
      loTitle: lo.title,
      loType: lo.type,
      student: { login },
      at: new Date("2026-09-26T09:00:00Z")
    });
  };
  const recordsStatement = () => {
    const recorder = createStatementRecorder({ client: createLrsClient({ endpoint: ENDPOINT, key: KEY, secret: SECRET, fetch: storeFetch }), hasConsent: (login) => consenting.has(login) });
    return recorder.record(statement);
  };

  Background(({ Given, And }) => {
    Given("the course {string} is published with {number} labs", (_ctx, courseId: string, labCount: number) => {
      const labs = Array.from({ length: labCount }, (_, l) => labShape(`Lab ${l + 1}`, [{ title: "Setup", contentMd: "# Setup" }]));
      course = loadCourse(courseId, `Course ${courseId}`, [shape("topic", "Topic 1", labs)]);
    });
    And("a learning record store accepts statements", () => {
      requests = [];
      consenting = new Set();
    });
  });

  Rule(
    "When a signed-in student opens a learning object, tutors shall build an xAPI statement that names the student's GitHub account, the verb experienced, the learning object as the activity and the course as its parent.",
    ({ RuleScenario }) => {
      RuleScenario("Opening a lab builds an experienced statement", ({ When, Then, And }) => {
        When("{string} opens lab {number}", opens);
        Then("the statement actor should be the GitHub account {string}", (_ctx, login: string) => {
          expect(statement.actor.account).toEqual({ homePage: "https://github.com", name: login });
        });
        And("the statement verb should be {string}", (_ctx, verb: string) => {
          expect(statement.verb.id).toBe(verb);
        });
        And("the statement activity should be lab {number}, typed {string}", (_ctx, n: number, type: string) => {
          expect(statement.object.id).toBe(`https://tutors.dev/${lab(n).route.replace(/^\/+/, "")}`);
          expect(statement.object.definition).toEqual({ type, name: { en: lab(n).title } });
        });
        And("the statement parent should be the course {string}", (_ctx, courseId: string) => {
          expect(statement.context.contextActivities.parent.map((a) => a.id)).toEqual([`https://tutors.dev/course/${courseId}`]);
        });
      });
    }
  );

  Rule(
    "When tutors records a statement for a student who has consented to learning analytics, tutors shall post it to the store's statements resource with the xAPI version header and the store's credentials.",
    ({ RuleScenario }) => {
      RuleScenario("A consenting student's statement reaches the store", ({ Given, When, And, Then }) => {
        Given("{string} has consented to learning analytics", (_ctx, login: string) => {
          consenting.add(login);
        });
        When("{string} opens lab {number}", opens);
        And("tutors records the statement", async () => {
          expect(await recordsStatement()).toBe(true);
        });
        Then("the store should have received {number} statement for {string}", (_ctx, count: number, login: string) => {
          expect(requests.map((r) => r.url)).toEqual([`${ENDPOINT}/statements`]);
          expect(sentStatements().filter((s) => s.actor.account.name === login)).toHaveLength(count);
        });
        And("the request should carry the xAPI version {string} and the store's credentials", (_ctx, version: string) => {
          const headers = new Headers(requests[0].init.headers);
          expect(requests[0].init.method).toBe("POST");
          expect(headers.get("X-Experience-API-Version")).toBe(version);
          expect(headers.get("Authorization")).toBe(`Basic ${btoa(`${KEY}:${SECRET}`)}`);
        });
      });
    }
  );

  Rule("If a student has not consented to learning analytics, then tutors shall not send statements about that student to the learning record store.", ({ RuleScenario }) => {
    RuleScenario("A student without consent sends nothing", ({ Given, When, And, Then }) => {
      Given("{string} has not consented to learning analytics", (_ctx, login: string) => {
        expect(consenting.has(login)).toBe(false);
      });
      When("{string} opens lab {number}", opens);
      And("tutors records the statement", async () => {
        expect(await recordsStatement()).toBe(false);
      });
      Then("the store should have received no statements", () => {
        expect(requests).toEqual([]);
      });
    });
  });
});
