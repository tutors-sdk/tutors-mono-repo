import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import yaml from "js-yaml";

import { labShape, loadCourse, shape } from "../../support/course.ts";
import type { Course, Lo } from "../../../../packages/jsr/model/src/tutors.ts";
import {
  BadgesFileError,
  createSigningClient,
  issueBadge,
  OB_V3_CONTEXT,
  parseBadgeDefinitions,
  type BadgeDefinition,
  type CourseNode,
  type Issuer,
  type OpenBadgeCredential
} from "../../../../packages/svelte/utils/badges/src/index.ts";

type FetchInit = NonNullable<Parameters<typeof fetch>[1]>;

const feature = await loadFeature("tests/bdd/features/student/course-badges.feature");

const SIGNING_ENDPOINT = "http://signing.test";
const PROOF = { type: "DataIntegrityProof", cryptosuite: "eddsa-rdfc-2022", proofValue: "zTest" };

describeFeature(feature, ({ Background, Rule }) => {
  let course: Course;
  let badgesYaml: string;
  let badges: BadgeDefinition[];
  let issuer: Issuer;
  let login: string;
  let opened: string[];
  let activeDays: string[];
  let signRequests: { url: string; body: OpenBadgeCredential }[];
  let credential: OpenBadgeCredential | null;
  let readError: unknown;

  // The seam: the signing service's HTTP endpoint. It echoes the credential back with a proof, as the service does.
  const signingFetch = (async (url: string, init: FetchInit) => {
    const body = JSON.parse(String(init.body)) as OpenBadgeCredential;
    signRequests.push({ url, body });
    return new Response(JSON.stringify({ ...body, proof: PROOF }), { status: 200 });
  }) as typeof fetch;

  const labs = (): Lo[] => [...new Set(course.loIndex.values())].filter((lo) => lo.type === "lab");
  // What the generator does with enrollment.yaml today: read the YAML into data.
  const readBadges = (text: string) => parseBadgeDefinitions(yaml.load(text));
  const checksBadge = async (_ctx: unknown, badgeId: string) => {
    credential = await issueBadge({
      issuer,
      badge: badges.find((b) => b.id === badgeId)!,
      course: { courseId: course.courseId, courseTitle: course.title },
      achievementBase: "https://tutors.dev",
      student: { login },
      issuedAt: new Date("2026-09-26T09:00:00Z"),
      courseTree: course as unknown as CourseNode,
      activity: { openedRoutes: opened, activeDays },
      signer: createSigningClient({ endpoint: SIGNING_ENDPOINT, tenant: "tutors", fetch: signingFetch })
    });
  };
  const openedLabs = (_ctx: unknown, student: string, a: number, b: number) => {
    login = student;
    opened = [labs()[a - 1].route, labs()[b - 1].route];
  };
  const activeOn = (_ctx: unknown, student: string, ...days: string[]) => {
    login = student;
    activeDays = days;
  };
  const receivesCredential = (_ctx: unknown, _student: string, name: string) => {
    expect(credential?.type).toEqual(["VerifiableCredential", "OpenBadgeCredential"]);
    expect(credential?.["@context"]).toContain(OB_V3_CONTEXT);
    expect(credential?.name).toBe(name);
  };
  const noCredential = () => expect(credential).toBeNull();
  const rejected = (_ctx: unknown, entry: string) => {
    expect(readError).toBeInstanceOf(BadgesFileError);
    expect((readError as Error).message).toContain(entry);
  };
  const tryRead = (text: string) => {
    readError = undefined;
    try {
      readBadges(text);
    } catch (error) {
      readError = error;
    }
  };

  Background(({ Given, And }) => {
    Given("the course {string} publishes a topic {string} with {number} labs and {number} note", (_ctx, courseId: string, topicId: string, labCount: number, noteCount: number) => {
      const children = [
        ...Array.from({ length: labCount }, (_, l) => labShape(`Lab ${l + 1}`, [{ title: "Setup", contentMd: "# Setup" }])),
        ...Array.from({ length: noteCount }, (_, n) => shape("note", `Note ${n + 1}`))
      ];
      course = loadCourse(courseId, `Course ${courseId}`, [shape("topic", "Topic 1", children)]);
      expect(course.los[0].id).toBe(topicId);
      opened = [];
      activeDays = [];
      signRequests = [];
      credential = null;
    });
    And("the course's badges.yaml reads:", (_ctx, docString: string) => {
      badgesYaml = docString;
      badges = readBadges(badgesYaml);
    });
    And("the institution {string} signs badges with the key {string}", (_ctx, name: string, id: string) => {
      issuer = { id, name };
    });
  });

  Rule(
    "When a student meets the criteria of a badge in a course's badges.yaml, tutors shall issue that badge as an Open Badges 3.0 credential signed by the institution's signing service.",
    ({ RuleScenario }) => {
      RuleScenario("Opening every lab in the topic earns the opened-all badge", ({ Given, When, Then, And }) => {
        Given("{string} has opened labs {number} and {number}", openedLabs);
        When("tutors checks the badge {string}", checksBadge);
        Then("{string} should receive an OpenBadgeCredential named {string}", receivesCredential);
        And("the credential issuer should be {string}", (_ctx, id: string) => {
          expect(credential?.issuer.id).toBe(id);
        });
        And("the credential should identify the student as {string}", (_ctx, identity: string) => {
          expect(credential?.credentialSubject.identifier.map((i) => i.identityHash)).toEqual([identity]);
        });
        And("the credential achievement should be {string}", (_ctx, id: string) => {
          expect(credential?.credentialSubject.achievement.id).toBe(id);
        });
        And("the credential should carry the signing service's proof", () => {
          expect(signRequests.map((r) => r.url)).toEqual([`${SIGNING_ENDPOINT}/instance/tutors/credentials/sign?suite=eddsa2022`]);
          expect(credential?.proof).toEqual(PROOF);
        });
      });

      RuleScenario("Activity on enough days earns the active-days badge", ({ Given, When, Then }) => {
        Given("{string} was active in the course on {string}, {string} and {string}", activeOn);
        When("tutors checks the badge {string}", checksBadge);
        Then("{string} should receive an OpenBadgeCredential named {string}", receivesCredential);
      });
    }
  );

  Rule("If a student has not met the criteria of a badge in a course's badges.yaml, then tutors shall not issue that badge.", ({ RuleScenario }) => {
    RuleScenario("A topic left unfinished earns nothing", ({ Given, When, Then, And }) => {
      Given("{string} has opened lab {number} only", (_ctx, student: string, n: number) => {
        login = student;
        opened = [labs()[n - 1].route];
      });
      When("tutors checks the badge {string}", checksBadge);
      Then("no credential should be issued", noCredential);
      And("the signing service should not have been called", () => {
        expect(signRequests).toEqual([]);
      });
    });

    RuleScenario("Too few active days earn nothing", ({ Given, When, Then }) => {
      Given("{string} was active in the course on {string} and {string}", activeOn);
      When("tutors checks the badge {string}", checksBadge);
      Then("no credential should be issued", noCredential);
    });

    RuleScenario("A manual badge is never issued automatically", ({ Given, And, When, Then }) => {
      Given("{string} has opened labs {number} and {number}", openedLabs);
      And("{string} was active in the course on {string}, {string} and {string}", activeOn);
      When("tutors checks the badge {string}", checksBadge);
      Then("no credential should be issued", noCredential);
    });
  });

  Rule(
    "If an entry in a course's badges.yaml has no id, has no title, repeats an id or names an unknown criterion, then tutors shall reject the file with an error that names the entry.",
    ({ RuleScenario }) => {
      RuleScenario("An unknown criterion is rejected", ({ When, Then }) => {
        When("tutors reads a badges.yaml whose entry {number} has the criteria {string}", (_ctx, entry: number, criteria: string) => {
          const entries = yaml.load(badgesYaml) as Record<string, unknown>[];
          entries[entry - 1] = { ...entries[entry - 1], criteria: yaml.load(criteria) };
          tryRead(yaml.dump(entries));
        });
        Then("the file should be rejected with an error naming {string}", rejected);
      });

      RuleScenario("A repeated id is rejected", ({ When, Then }) => {
        When("tutors reads a badges.yaml whose entry {number} repeats the id {string}", (_ctx, entry: number, id: string) => {
          const entries = yaml.load(badgesYaml) as Record<string, unknown>[];
          entries[entry - 1] = { ...entries[entry - 1], id };
          tryRead(yaml.dump(entries));
        });
        Then("the file should be rejected with an error naming {string}", rejected);
      });
    }
  );
});
