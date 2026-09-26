import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";

import { labShape, loadCourse, shape } from "../../support/course.ts";
import type { Composite, Course, Lo } from "../../../../packages/jsr/model/src/tutors.ts";
import { createSigningClient, issueTopicBadge, OB_V3_CONTEXT, type Issuer, type OpenBadgeCredential } from "../../../../packages/svelte/utils/badges/src/index.ts";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const feature = await loadFeature("tests/bdd/features/student/topic-badges.feature");

const SIGNING_ENDPOINT = "http://signing.test";
const PROOF = { type: "DataIntegrityProof", cryptosuite: "eddsa-rdfc-2022", proofValue: "zTest" };

describeFeature(feature, ({ Background, Rule }) => {
  let course: Course;
  let issuer: Issuer;
  let login: string;
  let opened: string[];
  let signRequests: { url: string; body: OpenBadgeCredential }[];
  let credential: OpenBadgeCredential | null;

  // The seam: the signing service's HTTP endpoint. It echoes the credential back with a proof, as the service does.
  const signingFetch = (async (url: string, init: FetchInit) => {
    const body = JSON.parse(String(init.body)) as OpenBadgeCredential;
    signRequests.push({ url, body });
    return new Response(JSON.stringify({ ...body, proof: PROOF }), { status: 200 });
  }) as typeof fetch;

  const topic = (title: string) => [...new Set(course.loIndex.values())].find((lo) => lo.type === "topic" && lo.title === title) as Composite;
  const labs = (): Lo[] => [...new Set(course.loIndex.values())].filter((lo) => lo.type === "lab");
  const checksBadge = async (_ctx: unknown, title: string) => {
    const t = topic(title);
    credential = await issueTopicBadge({
      issuer,
      achievement: { id: `https://tutors.dev/${t.route.replace(/^\/+/, "")}`, topicTitle: t.title, courseTitle: course.title },
      student: { login },
      issuedAt: new Date("2026-09-26T09:00:00Z"),
      topicLoRoutes: t.los.map((lo) => lo.route),
      openedRoutes: opened,
      signer: createSigningClient({ endpoint: SIGNING_ENDPOINT, tenant: "tutors", fetch: signingFetch })
    });
  };

  Background(({ Given, And }) => {
    Given("the course {string} is published with {number} labs in {string}", (_ctx, courseId: string, labCount: number, topicTitle: string) => {
      const labShapes = Array.from({ length: labCount }, (_, l) => labShape(`Lab ${l + 1}`, [{ title: "Setup", contentMd: "# Setup" }]));
      course = loadCourse(courseId, `Course ${courseId}`, [shape("topic", topicTitle, labShapes)]);
      signRequests = [];
      credential = null;
    });
    And("the institution {string} signs badges with the key {string}", (_ctx, name: string, id: string) => {
      issuer = { id, name };
    });
  });

  Rule(
    "When a student has opened every learning object in a topic, tutors shall issue an Open Badges 3.0 credential for that topic, signed by the institution's signing service.",
    ({ RuleScenario }) => {
      RuleScenario("Opening every lab in a topic earns its badge", ({ Given, When, Then, And }) => {
        Given("{string} has opened labs {number} and {number}", (_ctx, student: string, a: number, b: number) => {
          login = student;
          opened = [labs()[a - 1].route, labs()[b - 1].route];
        });
        When("tutors checks the badge for {string}", checksBadge);
        Then("{string} should receive an OpenBadgeCredential named {string}", (_ctx, _student: string, name: string) => {
          expect(credential?.type).toEqual(["VerifiableCredential", "OpenBadgeCredential"]);
          expect(credential?.["@context"]).toContain(OB_V3_CONTEXT);
          expect(credential?.name).toBe(name);
          expect(credential?.credentialSubject.achievement.name).toBe(name);
        });
        And("the credential issuer should be {string}", (_ctx, id: string) => {
          expect(credential?.issuer.id).toBe(id);
        });
        And("the credential should identify the student as {string}", (_ctx, identity: string) => {
          expect(credential?.credentialSubject.identifier.map((i) => i.identityHash)).toEqual([identity]);
        });
        And("the credential should carry the signing service's proof", () => {
          expect(signRequests.map((r) => r.url)).toEqual([`${SIGNING_ENDPOINT}/instance/tutors/credentials/sign?suite=eddsa2022`]);
          expect(credential?.proof).toEqual(PROOF);
        });
      });
    }
  );

  Rule("If a student has not opened every learning object in a topic, then tutors shall not issue that topic's badge.", ({ RuleScenario }) => {
    RuleScenario("A topic left unfinished earns nothing", ({ Given, When, Then, And }) => {
      Given("{string} has opened lab {number} only", (_ctx, student: string, n: number) => {
        login = student;
        opened = [labs()[n - 1].route];
      });
      When("tutors checks the badge for {string}", checksBadge);
      Then("no credential should be issued", () => {
        expect(credential).toBeNull();
      });
      And("the signing service should not have been called", () => {
        expect(signRequests).toEqual([]);
      });
    });
  });
});
