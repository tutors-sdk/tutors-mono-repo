import { readFileSync } from "node:fs";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { commandFor, usage, type Command } from "../../../../packages/jsr/tutors-cli/src/commands.ts";

const feature = await loadFeature("tests/bdd/features/developer/tutors-cli.feature");

describeFeature(feature, ({ Rule }) => {
  let command: Command = { kind: "help" };
  let targets: Record<string, string> = {};
  let workflow = "";

  const given = (_ctx: unknown, args: string) => {
    command = commandFor(args.split(" ").filter(Boolean));
  };
  const runs = (_ctx: unknown, kind: string) => expect(command.kind).toBe(kind);

  Rule(
    "Tutors shall run the generator for tutors build, tutors-lite for tutors website, and tutors-create for tutors validate, tutors import and tutors create, passing every later argument to the command.",
    ({ RuleScenarioOutline, RuleScenario }) => {
      RuleScenarioOutline("Each command names its package's work", ({ When, Then, And }, variables) => {
        When("the tutors program is given {string}", () => given(undefined, variables.args));
        Then("it runs the {string} command", () => runs(undefined, variables.command));
        And("it passes {string} to the command", () => {
          const args = "args" in command ? command.args : [];
          expect(args.join(" ")).toBe(variables.rest);
        });
      });
      RuleScenario("The version names what is inside", ({ When, Then }) => {
        When("the tutors program is given {string}", given);
        Then("it runs the {string} command", runs);
      });
      RuleScenario("An unknown command shows the usage", ({ When, Then, And }) => {
        When("the tutors program is given {string}", given);
        Then("it shows the usage, naming {string} as unknown", (_ctx, name: string) => expect(command).toEqual({ kind: "help", unknown: name }));
        And("the usage lists build, website, validate, import and create", () => {
          for (const name of ["build", "website", "validate", "import", "create"]) expect(usage).toMatch(new RegExp(`^  ${name} `, "m"));
        });
      });
    }
  );

  Rule(
    "When a Tutors release is published, tutors shall attach the tutors program compiled for each target in packages/jsr/tutors-cli/targets.json, with a SHA256SUMS of every file it attaches.",
    ({ RuleScenario }) => {
      RuleScenario("Windows x64 is a target, with an .exe name", ({ Given, Then, And }) => {
        Given("the targets the tutors program is compiled for", () => {
          targets = JSON.parse(readFileSync("packages/jsr/tutors-cli/targets.json", "utf8")) as Record<string, string>;
        });
        Then("{string} is a target named {string}", (_ctx, target: string, name: string) => expect(targets[target]).toBe(name));
        And("every target's file name starts with {string} and names its target", (_ctx, prefix: string) => {
          for (const [target, name] of Object.entries(targets)) expect(name.replace(/\.exe$/, "")).toBe(`${prefix}${target}`);
        });
      });
      RuleScenario("The release workflow compiles each target and sums the files", ({ Given, Then, And }) => {
        Given("the tutors program release workflow", () => {
          workflow = readFileSync(".github/workflows/tutors-cli-release.yml", "utf8");
        });
        Then("it compiles every key of targets.json with deno compile", () => {
          expect(workflow).toContain("jq -r 'keys[]' targets.json");
          expect(workflow).toMatch(/deno compile [^\n]*--target "\$target"/);
        });
        And("it writes and checks a SHA256SUMS before attaching the files", () => {
          const sums = workflow.indexOf("sha256sum -c SHA256SUMS");
          expect(sums).toBeGreaterThan(-1);
          expect(sums).toBeLessThan(workflow.indexOf("gh release upload"));
        });
        And("the release candidate dispatch calls it for the candidate's tag", () => {
          const dispatch = readFileSync(".github/workflows/release-dispatch.yml", "utf8");
          expect(dispatch).toContain("uses: ./.github/workflows/tutors-cli-release.yml");
        });
      });
    }
  );
});
