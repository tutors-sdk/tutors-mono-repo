import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { libraryAt, PUBLISHED, publishPlan } from "../../../../scripts/release/jsr-publish.mjs";
import { REPO_ROOT } from "../../../../scripts/checks/lib/repo.ts";

const feature = await loadFeature("tests/bdd/features/developer/jsr-publish.feature");

type Library = { path: string; name: string; version: string; imports: string[] };

describeFeature(feature, ({ Rule }) => {
  let libraries: Library[] = [];
  let missing = new Set<string>();
  let plan: Library[] = [];

  const given = () => {
    libraries = PUBLISHED.map((path: string) => libraryAt(REPO_ROOT, path));
  };
  const planned = async () => {
    plan = await publishPlan(libraries, async (name: string, version: string) => !missing.has(`${name}@${version}`));
  };

  Rule("When a Tutors release is published, tutors shall publish to JSR every library whose deno.json version JSR does not serve, each after the Tutors libraries it imports.", ({ RuleScenario }) => {
    RuleScenario("Only the versions JSR lacks are published, dependencies first", ({ Given, And, When, Then }) => {
      Given("the libraries in the repository", given);
      And("JSR serves every version except {string} and {string}", (_ctx, first: string, second: string) => {
        missing = new Set([first, second]);
        // The scenario names the versions on main; if a deno.json moves, this says which.
        for (const spec of missing) expect(libraries.map((l) => `${l.name}@${l.version}`)).toContain(spec);
      });
      When("the publish is planned", planned);
      Then("the plan is {string}", (_ctx, paths: string) => expect(plan.map((l) => l.path).join(", ")).toBe(paths));
    });
    RuleScenario("A library is published after every library it imports", ({ Given, And, When, Then }) => {
      Given("the libraries in the repository", given);
      And("JSR serves none of them", () => {
        missing = new Set(libraries.map((l) => `${l.name}@${l.version}`));
      });
      When("the publish is planned", planned);
      Then("every library comes after each Tutors library it imports", () => {
        expect(plan).toHaveLength(libraries.length);
        const position = new Map(plan.map((l, i) => [l.name, i]));
        for (const library of plan) for (const name of library.imports) if (position.has(name)) expect(position.get(name)!, `${library.name} imports ${name}`).toBeLessThan(position.get(library.name)!);
      });
      And("{string} comes first", (_ctx, path: string) => expect(plan[0]!.path).toBe(path));
    });
    RuleScenario("Nothing is published when JSR has every version", ({ Given, And, When, Then }) => {
      Given("the libraries in the repository", given);
      And("JSR serves every version", () => {
        missing = new Set();
      });
      When("the publish is planned", planned);
      Then("the plan is empty", () => expect(plan).toEqual([]));
    });
  });
});
