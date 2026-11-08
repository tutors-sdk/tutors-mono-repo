import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { MemoryFileSystem, validate, type Finding } from "../../../../packages/jsr/course-rules/src/mod.ts";
import { validateFixture, type FixtureForm } from "../../../support/validate-fixtures.ts";

const feature = await loadFeature("tests/bdd/features/instructor/course-validation.feature");

describeFeature(feature, ({ Rule }) => {
  let course: MemoryFileSystem;
  let findings: Finding[];

  const givenFixture = (_ctx: unknown, form: string, rule: string) => {
    course = new MemoryFileSystem(validateFixture(rule, form as FixtureForm));
  };
  const whenValidated = async () => {
    findings = await validate(course);
  };
  const exactly = (_ctx: unknown, expected: string) => {
    const actual = findings.map((f) => `${f.rule} ${f.severity} ${f.path === "" ? "<root>" : f.path}`).sort();
    expect(actual).toEqual(expected.split("; ").sort());
  };
  const none = () => expect(findings).toEqual([]);
  const findingFor = (path: string) => findings.find((f) => f.path === path)!;
  const says = (_ctx: unknown, path: string, text: string) => expect(findingFor(path).message).toContain(text);
  const suggests = (_ctx: unknown, path: string, name: string) => expect(findingFor(path).suggestedName).toBe(name);

  Rule("If a course folder has no course.md at its root, then tutors shall report rule V001 against the course folder.", ({ RuleScenario }) => {
    RuleScenario("A folder of topics with no course.md", ({ Given, When, Then }) => {
      Given("the {string} course of fixture {string}", givenFixture);
      When("the course is validated", whenValidated);
      Then("the findings shall be exactly {string}", exactly);
    });
    RuleScenario("The same course with its course.md", ({ Given, When, Then }) => {
      Given("the {string} course of fixture {string}", givenFixture);
      When("the course is validated", whenValidated);
      Then("there shall be no findings", none);
    });
  });

  Rule(
    "If a folder's name starts with no learning-object kind and the folder holds anything other than images, then tutors shall report rule V002 against that folder with a sentence saying it won't appear in the course.",
    ({ RuleScenario }) => {
      RuleScenario("Folders named for a week, a lab and slides are each named once", ({ Given, When, Then, And }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("the findings shall be exactly {string}", exactly);
        And("the finding for {string} shall say {string}", says);
        And("the finding for {string} shall suggest the name {string}", suggests);
      });
      RuleScenario("Typed folders, an img folder and hidden folders pass", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("there shall be no findings", none);
      });
    }
  );

  Rule("If a unit, side or topic folder holds no .md file, then tutors shall report rule V003 against that folder.", ({ RuleScenario }) => {
    RuleScenario("A unit and a topic with no descriptor", ({ Given, When, Then }) => {
      Given("the {string} course of fixture {string}", givenFixture);
      When("the course is validated", whenValidated);
      Then("the findings shall be exactly {string}", exactly);
    });
    RuleScenario("The same course with descriptors", ({ Given, When, Then }) => {
      Given("the {string} course of fixture {string}", givenFixture);
      When("the course is validated", whenValidated);
      Then("there shall be no findings", none);
    });
  });

  Rule(
    "If a talk lacks a .md or holds other than one deck, a note holds other than one .md, or a lab's steps are misnamed or skip a number, then tutors shall report rule V004 against the folder or file at fault.",
    ({ RuleScenario }) => {
      RuleScenario("Two PDFs, no slides, two notes and a gap in the steps", ({ Given, When, Then, And }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("the findings shall be exactly {string}", exactly);
        And("the finding for {string} shall say {string}", says);
      });
      RuleScenario("Each talk with one deck, each note with one file, contiguous steps", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("there shall be no findings", none);
      });
    }
  );

  Rule(
    "If a web link's weburl file or a GitHub link's githubid file is missing or its first line is not an address, then tutors shall report rule V005 against the link.",
    ({ RuleScenario }) => {
      RuleScenario("A missing weburl, an empty weburl and a githubid in prose", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("the findings shall be exactly {string}", exactly);
      });
      RuleScenario("Each link file holding its address", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("there shall be no findings", none);
      });
    }
  );

  Rule(
    "If properties.yaml, calendar.yaml, enrollment.yaml or badges.yaml does not parse or does not have the shape the generator reads, then tutors shall report rule V006 against that file.",
    ({ RuleScenario }) => {
      RuleScenario("A tab in properties, a calendar with no weeks and an enrollment that is a bare list", ({ Given, When, Then, And }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("the findings shall be exactly {string}", exactly);
        And("the finding for {string} shall say {string}", says);
      });
      RuleScenario("The same files written as the generator reads them", ({ Given, When, Then }) => {
        Given("the {string} course of fixture {string}", givenFixture);
        When("the course is validated", whenValidated);
        Then("there shall be no findings", none);
      });
    }
  );
});
