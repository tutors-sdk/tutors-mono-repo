import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { actionFor, fixedTitle, messageFor, requiredHints, type Action, type FileChange, type Origin } from "../../../../scripts/checks/changelog-hint.ts";

const feature = await loadFeature("tests/bdd/features/developer/changelog-hint.feature");

const manifest = (section: string, names: string[]) => JSON.stringify({ name: "x", [section]: Object.fromEntries(names.map((n) => [n, "^1.0.0"])) }, null, 2);

describeFeature(feature, ({ Rule, BeforeEachScenario }) => {
  let changes: FileChange[] = [];
  let title = "";
  let body = "";
  let origin: Origin = { fork: false, bot: false };
  let action: Action | undefined;
  const reset = () => {
    changes = [];
    title = "";
    body = "";
    origin = { fork: false, bot: false };
    action = undefined;
  };
  BeforeEachScenario(reset);

  const addsDependency = (_ctx: unknown, name: string, path: string) => {
    changes.push({ path, before: manifest("dependencies", []), after: manifest("dependencies", [name]) });
  };
  const addsDevDependency = (_ctx: unknown, name: string, path: string) => {
    changes.push({ path, before: manifest("devDependencies", []), after: manifest("devDependencies", [name]) });
  };
  const addsLogError = (_ctx: unknown, path: string) => {
    changes.push({ path, before: "export const f = () => 1;\n", after: 'export const f = () => {\n  log.error("Content lock write failed");\n  return 1;\n};\n' });
  };
  const titled = (_ctx: unknown, t: string) => {
    title = t;
  };
  const required = () => requiredHints(changes).map((r) => r.artefact);

  Rule(
    "When a pull request changes the production dependencies of an app or a package, changes a Dockerfile instruction, or adds an error or warning log call, tutors shall require the sbom, image-manifest or logs CHANGELOG hint that change moves.",
    ({ RuleScenario }) => {
      RuleScenario("A new dependency in the reader requires sbom", ({ Given, When, Then }) => {
        Given("a pull request that adds {string} to the dependencies of {string}", addsDependency);
        When("the CHANGELOG hint is checked", () => {});
        Then("the required hints shall be {string}", (_ctx, hints: string) => {
          expect(required().join(", ")).toBe(hints);
        });
      });

      RuleScenario("A Dockerfile instruction requires image-manifest and a new error log requires logs", ({ Given, And, When, Then }) => {
        Given("a pull request that adds a HEALTHCHECK instruction to {string}", (_ctx, path: string) => {
          changes.push({
            path,
            before: 'FROM node:22\nCMD ["node", "build"]\n',
            after: 'FROM node:22\nHEALTHCHECK --interval=15s CMD ["node", "-e", "0"]\nCMD ["node", "build"]\n'
          });
        });
        And("a pull request that adds a log.error call to {string}", addsLogError);
        When("the CHANGELOG hint is checked", () => {});
        Then("the required hints shall be {string}", (_ctx, hints: string) => {
          expect(required().join(", ")).toBe(hints);
        });
      });

      RuleScenario("Dev dependencies, Dockerfile comments and tests require nothing", ({ Given, And, When, Then }) => {
        Given("a pull request that adds {string} to the devDependencies of {string}", addsDevDependency);
        And("a pull request that edits a comment in {string}", (_ctx, path: string) => {
          changes.push({ path, before: "# The runtime image.\nFROM node:22\n", after: "# The runtime image, non-root.\nFROM node:22\n" });
        });
        And("a pull request that adds a log.error call to {string}", addsLogError);
        When("the CHANGELOG hint is checked", () => {});
        Then("no hint shall be required", () => {
          expect(required()).toEqual([]);
        });
      });
    }
  );

  Rule(
    "When a pull request's title hint leaves out an artefact its diff requires, tutors shall set the title's hint to every artefact the title or the CHANGELOG line declared and every artefact the diff requires.",
    ({ RuleScenario }) => {
      RuleScenario("The missing artefact joins the title's hint", ({ Given, And, When, Then }) => {
        Given("a pull request titled {string}", titled);
        And("a pull request that adds {string} to the dependencies of {string}", addsDependency);
        When("the CHANGELOG hint is checked", () => {});
        Then("the title shall become {string}", (_ctx, expected: string) => {
          expect(fixedTitle(title, body, requiredHints(changes))).toBe(expected);
        });
      });

      RuleScenario("A hint in the CHANGELOG line moves to the title with the missing artefact", ({ Given, And, When, Then }) => {
        Given("a pull request titled {string}", titled);
        And("its body has the CHANGELOG line {string}", (_ctx, line: string) => {
          body = `## Changes\n\n${line}\n`;
        });
        And("a pull request that adds {string} to the dependencies of {string}", addsDependency);
        When("the CHANGELOG hint is checked", () => {});
        Then("the title shall become {string}", (_ctx, expected: string) => {
          expect(fixedTitle(title, body, requiredHints(changes))).toBe(expected);
        });
      });

      RuleScenario("A complete hint in the CHANGELOG line moves to the title, where the release changelog reads it", ({ Given, And, When, Then }) => {
        Given("a pull request titled {string}", titled);
        And("its body has the CHANGELOG line {string}", (_ctx, line: string) => {
          body = `## Changes\n\n${line}\n`;
        });
        And("a pull request that adds {string} to the dependencies of {string}", addsDependency);
        When("the CHANGELOG hint is checked", () => {});
        Then("the title shall become {string}", (_ctx, expected: string) => {
          expect(fixedTitle(title, body, requiredHints(changes))).toBe(expected);
        });
      });

      RuleScenario("A title that already declares the artefact is left alone", ({ Given, And, When, Then }) => {
        Given("a pull request titled {string}", titled);
        And("a pull request that adds {string} to the dependencies of {string}", addsDependency);
        When("the CHANGELOG hint is checked", () => {});
        Then("the title shall stay as it is", () => {
          expect(fixedTitle(title, body, requiredHints(changes))).toBeUndefined();
        });
      });
    }
  );

  Rule(
    "If tutors cannot edit the title of a pull request whose CHANGELOG hint leaves out a required artefact, then tutors shall fail the hint check with the title to use, except for a bot's pull request, which gets a warning.",
    ({ RuleScenario }) => {
      const leavesOut = () => {
        action = actionFor(true, origin);
      };
      const namesTitle = () => {
        const use = "fix(reader): locks (persistence, sbom)";
        expect(messageFor(action!, use, [{ artefact: "sbom", because: "apps/reader/package.json changes its dependencies" }])).toContain(use);
      };

      RuleScenario("A fork's pull request fails with the title to use", ({ Given, When, Then, And }) => {
        Given("the pull request comes from a fork", () => {
          origin = { fork: true, bot: false };
        });
        When("its hint leaves out a required artefact", leavesOut);
        Then("the check shall fail", () => {
          expect(action).toBe("fail");
        });
        And("the message shall name the title to use", namesTitle);
      });

      RuleScenario("A bot's pull request gets a warning", ({ Given, When, Then, And }) => {
        Given("the pull request is a bot's", () => {
          origin = { fork: false, bot: true };
        });
        When("its hint leaves out a required artefact", leavesOut);
        Then("the check shall warn", () => {
          expect(action).toBe("warn");
        });
        And("the message shall name the title to use", namesTitle);
      });

      RuleScenario("A branch in the repository has its title edited", ({ Given, When, Then }) => {
        Given("the pull request comes from a branch in the repository", () => {
          origin = { fork: false, bot: false };
        });
        When("its hint leaves out a required artefact", leavesOut);
        Then("the title shall be edited", () => {
          expect(action).toBe("edit");
        });
      });
    }
  );
});
