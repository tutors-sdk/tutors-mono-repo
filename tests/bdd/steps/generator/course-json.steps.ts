import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import type { TutorsJsonCourse, TutorsJsonLo, TutorsJsonStep } from "../../../../packages/jsr/types/src/tutors-json.ts";
import { diffSnapshots, matchClaims, normaliseFile, parseClaims, type Claim, type ClaimResult } from "../../../../scripts/checks/generator-compare.ts";
import { tutorsJsonErrors } from "../../../../scripts/checks/lib/tutors-json.ts";
import { descendants, syntheticTutorsJson } from "../../../support/synthetic-course.ts";

const feature = await loadFeature("tests/bdd/features/generator/course-json.feature");

type AnyLo = TutorsJsonLo | TutorsJsonStep;

describeFeature(feature, ({ Background, Rule }) => {
  let root: string;
  let json: TutorsJsonCourse;

  const all = (): AnyLo[] => descendants(json);
  const byId = (id: string): TutorsJsonLo => {
    const found = all().filter((lo) => lo.id === id);
    expect(found, `exactly one learning object with id ${id}`).toHaveLength(1);
    return found[0] as TutorsJsonLo;
  };
  const topics = () => json.los.filter((lo) => lo.type === "topic");

  Background(({ Given }) => {
    Given("the synthetic corpus course has been generated", () => {
      ({ root, json } = syntheticTutorsJson());
    });
  });

  Rule("Tutors shall write a tutors.json that conforms to the tutors.json schema in @tutors/tutors-types.", ({ RuleScenario }) => {
    RuleScenario("The synthetic course conforms to the schema", ({ Then, And }) => {
      Then("the tutors.json has no schema errors", () => {
        expect(tutorsJsonErrors(json)).toEqual([]);
      });
      And("it holds every learning-object kind the corpus authors: {string}", (_ctx, kinds: string) => {
        const written = new Set(all().map((lo) => lo.type));
        for (const kind of kinds.split(", ")) expect(written, kind).toContain(kind);
      });
    });

    RuleScenario("A field the schema does not name is refused", ({ Given, Then }) => {
      Given("the generator also wrote the field {string} on the first topic", (_ctx, field: string) => {
        (json.los[0] as Record<string, unknown>)[field] = true;
      });
      Then("the schema reports {string}", (_ctx, error: string) => {
        expect(tutorsJsonErrors(json)).toEqual([error]);
      });
    });

    RuleScenario("A missing route is refused", ({ Given, Then }) => {
      Given("the generator left out the route of the second topic", () => {
        delete (json.los[1] as Partial<TutorsJsonLo>).route;
      });
      Then("the schema reports {string}", (_ctx, error: string) => {
        expect(tutorsJsonErrors(json)).toEqual([error]);
      });
    });
  });

  Rule(
    "Tutors shall address every file of a course in tutors.json through the {{COURSEURL}} placeholder, so one build serves every host the course is published on.",
    ({ RuleScenario }) => {
      RuleScenario("Images, PDFs and whiteboards point at the placeholder", ({ Then, And }) => {
        Then("every img, pdf and excalidraw value that is set starts with {string}", (_ctx, prefix: string) => {
          const values = [json, ...all()].flatMap((lo) => ["img", "pdf", "excalidraw"].map((key) => (lo as Record<string, unknown>)[key]));
          const set = values.filter((value): value is string => typeof value === "string" && value !== "");
          expect(set.length).toBeGreaterThan(5);
          for (const value of set) expect(value.startsWith(prefix), value).toBe(true);
        });
        And("every route that is not a web or github link carries {string}", (_ctx, placeholder: string) => {
          const routed = all().filter((lo) => lo.type !== "web" && lo.type !== "github");
          for (const lo of routed) expect(lo.route, `${lo.type} ${lo.id}`).toContain(placeholder);
          for (const link of all().filter((lo) => lo.type === "web" || lo.type === "github")) expect(link.route).toMatch(/^https:\/\//);
        });
      });
    }
  );

  Rule(
    "When a lecturer builds a lab, tutors shall write one step per markdown file in file-name order, each with the lab's route followed by the step's short title.",
    ({ RuleScenario }) => {
      RuleScenario("The steps of a lab", ({ Then, And }) => {
        Then("the lab {string} has the steps {string}", (_ctx, id: string, steps: string) => {
          const lab = byId(id);
          expect(lab.type).toBe("lab");
          expect((lab.los ?? []).map((step) => step.id).join(", ")).toBe(steps);
        });
        And("each step of the lab {string} has the lab's route followed by its id", (_ctx, id: string) => {
          const lab = byId(id);
          for (const step of lab.los as TutorsJsonStep[]) {
            expect(step.type).toBe("step");
            expect(step.shortTitle).toBe(step.id);
            expect(step.route).toBe(`${lab.route}/${step.id}`);
          }
        });
      });
    }
  );

  Rule("When properties.yaml lists a topic under ignore, tutors shall write that topic with hide set to true rather than leave it out.", ({ RuleScenario }) => {
    RuleScenario("An ignored topic is written hidden", ({ Then, And }) => {
      Then("the topic {string} is in the tutors.json with hide set to true", (_ctx, id: string) => {
        const topic = topics().find((lo) => lo.id === id);
        expect(topic?.hide).toBe(true);
        expect(topic?.los?.length).toBeGreaterThan(0);
      });
      And("no other topic has hide set to true", () => {
        expect(
          topics()
            .filter((lo) => lo.hide)
            .map((lo) => lo.id)
        ).toEqual(["topic-09-hidden"]);
      });
    });
  });

  Rule(
    "When a course folder holds properties.yaml, calendar.yaml or enrollment.yaml, tutors shall copy each into tutors.json as properties, calendar and enrollment, unchanged.",
    ({ RuleScenarioOutline }) => {
      RuleScenarioOutline("Course YAML is copied as written", ({ Then }, variables) => {
        Then('"<key>" in the tutors.json equals the course\'s "<file>"', () => {
          // JSON round trip: dates in calendar.yaml reach tutors.json as ISO strings, as JSON.stringify writes them.
          const written = JSON.parse(JSON.stringify(yaml.load(readFileSync(join(root, variables.file), "utf8"))));
          expect(written).toBeTruthy();
          expect((json as Record<string, unknown>)[variables.key]).toEqual(written);
        });
      });
    }
  );

  Rule("Tutors shall leave out of tutors.json every folder whose name starts with no learning-object kind.", ({ RuleScenario }) => {
    RuleScenario("A drafts folder is left out", ({ Then }) => {
      Then("no learning object in the tutors.json has the id {string}", (_ctx, id: string) => {
        expect(all().map((lo) => lo.id)).not.toContain(id);
      });
    });
  });

  Rule(
    "When a pull request changes the generator, tutors shall fail the generator differential unless every difference in the corpus output is claimed in tests/generator/claims.yaml.",
    ({ RuleScenario }) => {
      let candidate: TutorsJsonCourse;
      let claims: Claim[] = [];
      let result: ClaimResult;

      const changeTitle = (_ctx: unknown, id: string) => {
        candidate = structuredClone(json);
        const topic = candidate.los.find((lo) => lo.id === id)!;
        topic.title = `${topic.title}!`;
        claims = [];
      };
      const compare = () => {
        const snapshot = (course: TutorsJsonCourse) => ({ "tutors.json": normaliseFile("tutors.json", Buffer.from(JSON.stringify(course))) });
        const hunks = diffSnapshots("synthetic", "tutors", snapshot(json), snapshot(candidate));
        expect(hunks.length).toBeGreaterThan(0);
        result = matchClaims(hunks, claims);
      };

      RuleScenario("An unclaimed difference fails", ({ Given, When, Then }) => {
        Given("the candidate generator changed the title of {string}", changeTitle);
        When("the differential compares it with the base", compare);
        Then("the difference {string} is unclaimed", (_ctx, pointer: string) => {
          expect(result.unclaimed.map((hunk) => hunk.pointer)).toEqual([pointer]);
        });
      });

      RuleScenario("A claimed difference passes", ({ Given, And, When, Then }) => {
        Given("the candidate generator changed the title of {string}", changeTitle);
        And("claims.yaml claims {string} in {string} because {string}", (_ctx, pointer: string, path: string, reason: string) => {
          const parsed = parseClaims(yaml.dump({ claims: [{ generator: "tutors", path, pointer, reason }] }));
          expect(parsed.errors).toEqual([]);
          claims = parsed.claims;
        });
        When("the differential compares it with the base", compare);
        Then("no difference is unclaimed", () => {
          expect(result.unclaimed).toEqual([]);
          expect(result.claimed).toHaveLength(1);
        });
      });
    }
  );
});
