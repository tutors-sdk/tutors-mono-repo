import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import { checkArchitecture, formatViolation, type ArchitectureViolation } from "../../../../scripts/checks/architecture.ts";
import { describeRatchet, ratchet } from "../../../../scripts/checks/lib/ratchet.ts";
import { REPO_ROOT, readBaseline } from "../../../../scripts/checks/lib/repo.ts";

const feature = await loadFeature("tests/bdd/features/developer/hexagonal-architecture.feature");

const BASELINE = "tests/architecture/known-violations.txt";
const FIXTURE = resolve(REPO_ROOT, "tests/architecture/fixtures/workspace");
const fixture = (path: string) => resolve(FIXTURE, path);

/** The fixture workspace's stand-ins for workspace packages and vendors (tests/architecture/dependency-rules.test.ts has the same). */
const FIXTURE_ALIASES = {
  "@tutors/domain": fixture("packages/domain/src/index.ts"),
  "@tutors/application": fixture("packages/application/src/index.ts"),
  "@tutors/tutors-model-lib": fixture("packages/jsr/model/src/index.ts"),
  "@tutors/logger": fixture("packages/platform/logger/src/index.ts"),
  "@tutors/store-supabase": fixture("packages/adapters/driven/store-supabase/src/index.ts"),
  "@tutors/svelte-state$": fixture("packages/adapters/driving/svelte-state/src/index.ts"),
  "@tutors/svelte-state/connect": fixture("packages/adapters/driving/svelte-state/src/connect/index.ts"),
  "@tutors/svelte-state/rbac": fixture("packages/adapters/driving/svelte-state/src/rbac/index.ts"),
  "@tutors/themes": fixture("packages/adapters/driving/themes/src/index.ts"),
  "@tutors/ui-primitives": fixture("packages/adapters/driving/ui-primitives/src/index.ts"),
  "@tutors/ui-navigators": fixture("packages/adapters/driving/ui-navigators/src/index.ts"),
  "@tutors/ui-components": fixture("packages/adapters/driving/ui-components/src/index.ts"),
  "@tutors/identity-better-auth/server": fixture("packages/adapters/driven/identity-better-auth/src/index.server.ts"),
  "tutors-catalogue": fixture("apps/catalogue/src/lib/page.ts"),
  "better-auth": fixture("external/better-auth/index.ts"),
  "@sveltejs/kit": fixture("external/sveltekit.ts"),
  "@supabase/supabase-js": fixture("external/@supabase/supabase-js.ts"),
  "shiki/core": fixture("external/shiki/core.ts"),
  "$app/env/private": fixture("external/$app/env/private.ts"),
  "$env/dynamic/private": fixture("external/$env/dynamic/private.ts")
};

// Both cruises are slow (the repository's takes seconds), so each runs once, while the feature loads.
const [fixtureViolations, repoViolations] = await Promise.all([
  checkArchitecture(["apps", "packages"], { baseDir: FIXTURE, alias: FIXTURE_ALIASES }),
  checkArchitecture(["apps", "packages"])
]);
const overFixture = async () => fixtureViolations;
const overRepo = async () => repoViolations;

const baseline = () => readBaseline(resolve(REPO_ROOT, BASELINE));

const sources = (dir: string, match: RegExp): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.name === "node_modules" || e.name === "dist" || e.name === ".svelte-kit"
      ? []
      : e.isDirectory()
        ? sources(join(dir, e.name), match)
        : match.test(e.name)
          ? [join(dir, e.name)]
          : []
  );

const isProductModule = (file: string) => !/\.(test|spec|d)\.ts$/.test(file) && !/(^|\/)(test|tests|__tests__|fixtures)\//.test(file);

describeFeature(feature, ({ Rule }) => {
  const namesViolation = (violations: ArchitectureViolation[], rule: string, from: string, to: string) => {
    const line = `${rule}: ${from} -> ${to}`;
    expect(violations.map(formatViolation), `expected ${line}`).toContain(line);
  };

  const noViolationOf = (violations: ArchitectureViolation[], rule: string) => {
    expect(violations.filter((v) => v.rule === rule).map(formatViolation)).toEqual([]);
  };

  Rule("Tutors shall keep the domain ring self-contained, with every import inside packages/domain.", ({ RuleScenario }) => {
    let violations: ArchitectureViolation[] = [];
    RuleScenario("A domain module that imports an application use case or a platform package is a violation", ({ Given, Then, And }) => {
      Given("the architecture rules run over the fixture workspace", async () => {
        violations = await overFixture();
      });
      Then("they name {string} for {string} importing {string}", (_ctx: unknown, rule: string, from: string, to: string) => namesViolation(violations, rule, from, to));
      And("they name {string} for {string} importing {string}", (_ctx: unknown, rule: string, from: string, to: string) => namesViolation(violations, rule, from, to));
    });
    RuleScenario("The repository's domain ring imports nothing outside itself", ({ Given, Then }) => {
      Given("the architecture rules run over the repository", async () => {
        violations = await overRepo();
      });
      Then("no violation of {string} is found", (_ctx: unknown, rule: string) => noViolationOf(violations, rule));
    });
  });

  Rule("Tutors shall keep the application ring importing only the domain ring and its own files, never an adapter or a vendor library.", ({ RuleScenario }) => {
    let violations: ArchitectureViolation[] = [];
    RuleScenario("A use case that imports an adapter or a vendor client is a violation", ({ Given, Then, And }) => {
      Given("the architecture rules run over the fixture workspace", async () => {
        violations = await overFixture();
      });
      Then("they name {string} for {string} importing {string}", (_ctx: unknown, rule: string, from: string, to: string) => namesViolation(violations, rule, from, to));
      And("they name {string} for {string} importing {string}", (_ctx: unknown, rule: string, from: string, to: string) => namesViolation(violations, rule, from, to));
    });
    RuleScenario("The repository's application ring imports only the domain", ({ Given, Then }) => {
      Given("the architecture rules run over the repository", async () => {
        violations = await overRepo();
      });
      Then("no violation of {string} is found", (_ctx: unknown, rule: string) => noViolationOf(violations, rule));
    });
  });

  Rule(
    "Tutors shall import a vendor library (the Supabase client, the markdown renderers, Better Auth) only from the adapter that wraps it, outside the authoring toolchain.",
    ({ RuleScenario }) => {
      let violations: ArchitectureViolation[] = [];
      RuleScenario("A package other than the wrapping adapter importing a vendor library is a violation", ({ Given, Then, And }) => {
        Given("the architecture rules run over the fixture workspace", async () => {
          violations = await overFixture();
        });
        Then("they name {string} for {string} importing {string}", (_ctx: unknown, rule: string, from: string, to: string) => namesViolation(violations, rule, from, to));
        And("they name {string} for {string} importing {string}", (_ctx: unknown, rule: string, from: string, to: string) => namesViolation(violations, rule, from, to));
        And("they also name {string} for {string} importing {string}", (_ctx: unknown, rule: string, from: string, to: string) => namesViolation(violations, rule, from, to));
      });
      RuleScenario("The repository's vendor imports outside their adapters are all in the baseline", ({ Given, Then }) => {
        Given("the architecture rules run over the repository", async () => {
          violations = await overRepo();
        });
        Then("every violation of {string} is listed in the known-violations baseline", (_ctx: unknown, rule: string) => {
          const known = baseline();
          const unlisted = violations
            .filter((v) => v.rule === rule)
            .map(formatViolation)
            .filter((line) => !known.includes(line));
          expect(unlisted).toEqual([]);
        });
      });
    }
  );

  Rule("Tutors shall keep a driven adapter from importing another adapter, so each wraps its one technology behind a port.", ({ RuleScenario }) => {
    let violations: ArchitectureViolation[] = [];
    RuleScenario("A driven adapter importing another driven adapter is a violation", ({ Given, Then }) => {
      Given("the architecture rules run over the fixture workspace", async () => {
        violations = await overFixture();
      });
      Then("they name {string} for {string} importing {string}", (_ctx: unknown, rule: string, from: string, to: string) => namesViolation(violations, rule, from, to));
    });
    RuleScenario("The repository's driven adapters import no other adapter", ({ Given, Then }) => {
      Given("the architecture rules run over the repository", async () => {
        violations = await overRepo();
      });
      Then("no violation of {string} is found", (_ctx: unknown, rule: string) => noViolationOf(violations, rule));
    });
  });

  Rule("Tutors shall keep Svelte rune state in package modules to the svelte-state adapter, so the rings and the other adapters know no framework.", ({ RuleScenario }) => {
    RuleScenario("No package module outside svelte-state holds a rune beyond the baseline", ({ Given, Then }) => {
      let modules: string[] = [];
      Given("the package modules outside the svelte-state adapter", () => {
        modules = sources(resolve(REPO_ROOT, "packages"), /\.ts$/)
          .map((file) => relative(REPO_ROOT, file))
          .filter((file) => !file.startsWith("packages/adapters/driving/svelte-state/") && isProductModule(file));
        expect(modules.length).toBeGreaterThan(0);
      });
      Then("none of them calls $state, $derived or $effect beyond the known-violations baseline", () => {
        const known = baseline().filter((line) => line.startsWith("runes-only-in-svelte-state:"));
        const found = modules
          .filter((file) => /\$(state|derived|effect)(\.\w+)?\(/.test(readFileSync(resolve(REPO_ROOT, file), "utf8")))
          .map((file) => `runes-only-in-svelte-state: ${file} -> svelte runes`);
        const result = ratchet(found, known);
        expect(result, describeRatchet("runes-only-in-svelte-state", BASELINE, result)).toEqual({ added: [], stale: [] });
      });
    });
  });

  Rule("Tutors shall read PUBLIC_ANON_MODE only in an app's composition root, which picks the adapters, so no package decides for itself whether it is anonymous.", ({ RuleScenario }) => {
    RuleScenario("Only the apps read the anonymous-mode setting", ({ Given, Then }) => {
      let files: string[] = [];
      Given("the source files under packages", () => {
        files = sources(resolve(REPO_ROOT, "packages"), /\.(ts|svelte)$/)
          .map((file) => relative(REPO_ROOT, file))
          .filter(isProductModule);
        expect(files.length).toBeGreaterThan(0);
      });
      Then("none of them reads {string}", (_ctx: unknown, setting: string) => {
        // A mention in a comment is fine; a read is the identifier used as code: `env.PUBLIC_ANON_MODE`, `{ PUBLIC_ANON_MODE }`, `PUBLIC_ANON_MODE ===`.
        const reads = files.filter((file) =>
          readFileSync(resolve(REPO_ROOT, file), "utf8")
            .split("\n")
            .some((line) => !/^\s*(\/\/|\*|\/\*)/.test(line) && line.includes(setting))
        );
        expect(reads).toEqual([]);
      });
    });
    RuleScenario("Each app has a composition root", ({ Given, Then }) => {
      let apps: string[] = [];
      Given("the apps {string}", (_ctx: unknown, names: string) => {
        apps = names.split(",").map((name) => name.trim());
      });
      Then("each has a {string} that reads {string}", (_ctx: unknown, file: string, setting: string) => {
        for (const app of apps) {
          const root = resolve(REPO_ROOT, "apps", app, file);
          expect(existsSync(root), `${app} has no ${file}`).toBe(true);
          expect(readFileSync(root, "utf8"), `${app}'s ${file} does not read ${setting}`).toContain(setting);
        }
      });
    });
  });

  Rule(
    "When a change adds an edge the ring rules forbid, tutors shall fail the architecture check naming the rule, the importing file and the import, with the known-violations baseline accepting no new line.",
    ({ RuleScenario }) => {
      let violations: ArchitectureViolation[] = [];
      RuleScenario("A new violation is reported by rule, file and import", ({ Given, Then }) => {
        Given("the architecture rules run over the fixture workspace", async () => {
          violations = await overFixture();
        });
        Then("the violation {string} for {string} importing {string} is reported as {string}", (_ctx: unknown, rule: string, from: string, to: string, line: string) => {
          const found = violations.find((v) => v.rule === rule && v.from === from && v.to === to);
          expect(found, line).toBeDefined();
          expect(formatViolation(found!)).toBe(line);
        });
      });
      RuleScenario("The repository adds nothing beyond the baseline and the baseline has no stale line", ({ Given, Then }) => {
        Given("the architecture rules run over the repository", async () => {
          violations = await overRepo();
        });
        Then("the violations match the known-violations baseline exactly", () => {
          const result = ratchet(violations.map(formatViolation), baseline());
          expect(result, describeRatchet("dependency-cruiser", BASELINE, result)).toEqual({ added: [], stale: [] });
        });
      });
    }
  );
});
