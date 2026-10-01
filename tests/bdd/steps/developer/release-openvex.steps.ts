import { resolve } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import yaml from "js-yaml";
import { expect } from "vitest";
import { REPO_ROOT, readText } from "../../../../scripts/checks/lib/repo.ts";
import { validateOpenVexText } from "../../../../scripts/checks/openvex.ts";

const feature = await loadFeature("tests/bdd/features/developer/release-openvex.feature");

interface Statement {
  vulnerability: { name: string };
  products: { "@id": string }[];
  status: string;
  justification?: string;
  impact_statement?: string;
  action_statement?: string;
}

interface WorkflowJob {
  steps?: { run?: string }[];
}

const document = (statements: Statement[]) => ({
  "@context": "https://openvex.dev/ns/v0.2.0",
  "@id": "https://github.com/tutors-sdk/tutors-mono-repo/release/openvex.json",
  author: "tutors release",
  timestamp: "2026-10-01T00:00:00Z",
  version: 1,
  statements
});

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  let text: string;
  let statements: Statement[];
  let errors: string[];
  let workflow: { on?: unknown; jobs: Record<string, WorkflowJob> };

  BeforeEachScenario(() => {
    statements = [];
    text = "";
    errors = [];
  });

  const statement = (status: string, advisory: string, product: string, extra: Partial<Statement> = {}): Statement => ({ vulnerability: { name: advisory }, products: [{ "@id": product }], status, ...extra });
  const write = () => {
    text = JSON.stringify(document(statements));
  };
  const add = (s: Statement) => {
    statements.push(s);
    write();
  };
  const givenJustified = (_ctx: unknown, status: string, advisory: string, product: string, justification: string) => add(statement(status, advisory, product, { justification }));
  const givenAction = (_ctx: unknown, status: string, advisory: string, product: string, action: string) => add(statement(status, advisory, product, { action_statement: action }));
  const givenBare = (_ctx: unknown, status: string, advisory: string, product: string) => add(statement(status, advisory, product));
  const check = () => {
    errors = validateOpenVexText(text);
  };
  const accepted = () => {
    expect(errors).toEqual([]);
  };
  const rejectedNaming = (_ctx: unknown, what: string) => {
    expect(errors.length, "the check rejects the file").toBeGreaterThan(0);
    expect(errors.join("\n")).toContain(what);
  };
  const alsoNaming = (_ctx: unknown, what: string) => {
    expect(errors.join("\n")).toContain(what);
  };

  Rule("When a maintainer checks release/openvex.json, tutors shall accept an OpenVEX document with the OpenVEX context, an id, an author, a timestamp, a version from 1 and a list of statements, empty or not.", ({ RuleScenario }) => {
    RuleScenario("The release's own file is accepted", ({ Given, When, Then }) => {
      Given("the OpenVEX file committed at release/openvex.json", () => {
        text = readText(resolve(REPO_ROOT, "release/openvex.json"));
      });
      When("the maintainer checks the OpenVEX file", check);
      Then("the check shall accept the OpenVEX file", accepted);
    });

    RuleScenario("A statement with each status written in full is accepted", ({ Given, And, When, Then }) => {
      Given("an OpenVEX file with a {string} statement for {string} in {string} justified as {string}", givenJustified);
      And("the OpenVEX file also has an {string} statement for {string} in {string} with the action {string}", givenAction);
      And("the OpenVEX file also has a {string} statement for {string} in {string}", givenBare);
      And("the OpenVEX file also has an {string} statement for {string} in {string}", givenBare);
      When("the maintainer checks the OpenVEX file", check);
      Then("the check shall accept the OpenVEX file", accepted);
    });
  });

  Rule("If a not_affected statement in release/openvex.json gives no standard OpenVEX justification, then tutors shall reject the file and name the statement.", ({ RuleScenario }) => {
    RuleScenario("An impact statement alone does not justify not_affected", ({ Given, When, Then, And }) => {
      Given("an OpenVEX file with a {string} statement for {string} in {string} explained only as {string}", (_ctx: unknown, status: string, advisory: string, product: string, impact: string) =>
        add(statement(status, advisory, product, { impact_statement: impact }))
      );
      When("the maintainer checks the OpenVEX file", check);
      Then("the check shall reject the OpenVEX file naming {string}", rejectedNaming);
      And("the rejection shall list the standard justification {string}", alsoNaming);
    });

    RuleScenario("A justification outside the standard five is rejected", ({ Given, When, Then }) => {
      Given("an OpenVEX file with a {string} statement for {string} in {string} justified as {string}", givenJustified);
      When("the maintainer checks the OpenVEX file", check);
      Then("the check shall reject the OpenVEX file naming {string}", rejectedNaming);
    });
  });

  Rule("If release/openvex.json lacks a field the release harness reads, then tutors shall reject the file and name the field.", ({ RuleScenario }) => {
    RuleScenario("A product that is an image, not a package URL, is rejected", ({ Given, When, Then }) => {
      Given("an OpenVEX file with a {string} statement for {string} in {string}", givenBare);
      When("the maintainer checks the OpenVEX file", check);
      Then("the check shall reject the OpenVEX file naming {string}", rejectedNaming);
    });

    RuleScenario("An affected statement with no action is rejected", ({ Given, When, Then }) => {
      Given("an OpenVEX file with an {string} statement for {string} in {string} and no action", givenBare);
      When("the maintainer checks the OpenVEX file", check);
      Then("the check shall reject the OpenVEX file naming {string}", rejectedNaming);
    });

    RuleScenario("A document that is not OpenVEX is rejected", ({ Given, When, Then, And }) => {
      Given("an OpenVEX file with no context and no statements", () => {
        const rest: Record<string, unknown> = document([]);
        delete rest["@context"];
        delete rest.statements;
        text = JSON.stringify(rest);
      });
      When("the maintainer checks the OpenVEX file", check);
      Then("the check shall reject the OpenVEX file naming {string}", rejectedNaming);
      And("the rejection shall also name {string}", alsoNaming);
    });
  });

  Rule("When a release branch is pushed, tutors shall check release/openvex.json in the same job that checks release/claims.yaml.", ({ RuleScenario }) => {
    RuleScenario("The release claims workflow checks the OpenVEX file", ({ Given, When, Then }) => {
      Given("the release claims workflow", () => {
        workflow = yaml.load(readText(resolve(REPO_ROOT, ".github/workflows/release-claims.yml"))) as typeof workflow;
      });
      When("a release branch is pushed", () => {
        expect(JSON.stringify(workflow.on)).toContain("release/**");
      });
      Then("the job that runs {string} shall also run {string}", (_ctx: unknown, claims: string, openvex: string) => {
        const runs = (job: WorkflowJob) => (job.steps ?? []).map((s) => s.run?.trim() ?? "");
        const job = Object.values(workflow.jobs).find((j) => runs(j).some((r) => r.startsWith(claims)));
        expect(job, `a job runs ${claims}`).toBeDefined();
        expect(runs(job!).some((r) => r.startsWith(openvex))).toBe(true);
      });
    });
  });
});
