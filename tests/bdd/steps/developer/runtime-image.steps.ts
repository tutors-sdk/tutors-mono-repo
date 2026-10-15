import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { REPO_ROOT } from "../../../../scripts/checks/lib/repo.ts";

const feature = await loadFeature("tests/bdd/features/developer/runtime-image.feature");

/** The Dockerfile from `FROM … AS runtime` to the next stage or the end, with line continuations joined. */
function runtimeStage(): string {
  const text = readFileSync(join(REPO_ROOT, "Dockerfile"), "utf8").replace(/\\\n\s*/g, " ");
  const start = text.search(/^FROM\s+\S+\s+AS\s+runtime\b/im);
  expect(start, "the Dockerfile has a runtime stage").toBeGreaterThanOrEqual(0);
  const rest = text.slice(start);
  const next = rest.slice(1).search(/^FROM\s/im);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

describeFeature(feature, ({ Rule }) => {
  let stage = "";
  const givenStage = () => {
    stage = runtimeStage();
  };

  Rule("Tutors shall ship its runtime images with no package manager, removing npm, npx, corepack and yarn in the runtime stage.", ({ RuleScenario }) => {
    RuleScenario("The runtime stage removes every package manager", ({ Given, Then, And }) => {
      const removes = (path: string) => {
        const rm = stage.split("\n").filter((line) => /^RUN\b/.test(line) && /\brm\s+-rf\b/.test(line));
        expect(rm.some((line) => line.split(/\s+/).includes(path)), `a RUN rm -rf in the runtime stage names ${path}`).toBe(true);
      };
      Given("the runtime stage of the repository's Dockerfile", givenStage);
      Then("it removes {string}, where npm and corepack live", (_ctx: unknown, path: string) => removes(path));
      And("it removes the commands {string}", (_ctx: unknown, paths: string) => {
        for (const path of paths.split(",").map((p) => p.trim())) removes(path);
      });
    });

    RuleScenario("The runtime stage still starts the app with node alone", ({ Given, Then }) => {
      Given("the runtime stage of the repository's Dockerfile", givenStage);
      Then("its command runs {string}", (_ctx: unknown, command: string) => {
        const cmd = /^CMD\s+(\[.*\])/m.exec(stage);
        expect(cmd, "the runtime stage has an exec-form CMD").not.toBeNull();
        expect((JSON.parse(cmd![1]!) as string[]).join(" ")).toBe(command);
      });
    });
  });
});
