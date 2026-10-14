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


/** ARCHITECTURE.md, the authority on the shape (Rules 0347 to 0352). */
const ARCHITECTURE = "ARCHITECTURE.md";
const architectureDoc = () => readFileSync(resolve(REPO_ROOT, ARCHITECTURE), "utf8");

/** Every package.json name under apps/ and packages/, node_modules excluded. */
function workspacePackageNames(): string[] {
  const manifests = [...sources(resolve(REPO_ROOT, "apps"), /^package\.json$/), ...sources(resolve(REPO_ROOT, "packages"), /^package\.json$/)];
  return manifests.map((file) => (JSON.parse(readFileSync(file, "utf8")) as { name?: string }).name).filter((name): name is string => !!name).sort();
}

/** `export interface X` in the application ring's ports, the port names the document must carry. */
function portInterfaces(): string[] {
  return sources(resolve(REPO_ROOT, "packages/application/src/ports"), /\.ts$/)
    .flatMap((file) => [...readFileSync(file, "utf8").matchAll(/^export interface (\w+)/gm)].map((m) => m[1]))
    .filter((name) => !name.startsWith("Moodle") && !name.endsWith("Options"))
    .sort();
}

function forbiddenRuleNames(): string[] {
  const config = readFileSync(resolve(REPO_ROOT, ".dependency-cruiser.cjs"), "utf8");
  return [...new Set([...config.matchAll(/name: "([a-z-]+)"/g)].map((m) => m[1]))].filter((name) => !["supabase", "markdown", "better-auth"].includes(name)).sort();
}

/** Every `.from("table")` the adapters, the time library and the apps make. */
function queriedTables(): string[] {
  const roots = ["packages/adapters/driven", "packages/jsr/time/src", "apps"].map((dir) => resolve(REPO_ROOT, dir));
  const tables = roots
    .flatMap((root) => sources(root, /\.(ts|svelte)$/))
    .filter((file) => isProductModule(relative(REPO_ROOT, file)))
    .flatMap((file) => [...readFileSync(file, "utf8").matchAll(/\.from\("([a-z_-]+)"\)/g)].map((m) => m[1]));
  return [...new Set(tables)].sort();
}

const ruleIdsOf = (feature: string) => [...feature.matchAll(/@rule-(\d{4})/g)].map((m) => m[1]);

function allFeatureRuleIds(): Set<string> {
  return new Set(sources(resolve(REPO_ROOT, "tests/bdd/features"), /\.feature$/).flatMap((file) => ruleIdsOf(readFileSync(file, "utf8"))));
}

/** The ids the requirements table of the document cites, as `| 0340 |` rows. */
const citedRuleIds = (doc: string) => [...doc.matchAll(/^\| (\d{4}) \|/gm)].map((m) => m[1]);

/** A data-ownership or ports row names its subject in backticks in the first cell. */
const hasRowFor = (doc: string, name: string) => new RegExp("^\\| `" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "`", "m").test(doc);

/**
 * What the document leaves out: packages it does not name and tables it has no row for. The
 * architecture check fails with this list (Rule 0352).
 */
export function missingFromAuthority(doc: string, expected: { packages: string[]; tables: string[] }): string[] {
  return [
    ...expected.packages.filter((name) => !doc.includes("`" + name + "`")).map((name) => `package ${name}`),
    ...expected.tables.filter((table) => !hasRowFor(doc, table)).map((table) => `table ${table}`)
  ];
}

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

  Rule("Tutors shall name every workspace package in ARCHITECTURE.md, so a package that this document does not describe cannot exist.", ({ RuleScenario }) => {
    RuleScenario("Every package under apps and packages is named in the architecture document", ({ Given, Then }) => {
      let names: string[] = [];
      Given("the names of every workspace package", () => {
        names = workspacePackageNames();
        expect(names.length).toBeGreaterThan(20);
      });
      Then("ARCHITECTURE.md names each of them", () => {
        expect(missingFromAuthority(architectureDoc(), { packages: names, tables: [] })).toEqual([]);
      });
    });
  });

  Rule("Tutors shall name every port of the application ring in ARCHITECTURE.md, with the adapter that implements it.", ({ RuleScenario }) => {
    RuleScenario("Every port interface is in the ports table", ({ Given, Then }) => {
      let ports: string[] = [];
      Given("the interfaces exported from the application ring's ports", () => {
        ports = portInterfaces();
        expect(ports).toContain("PresencePort");
      });
      Then("ARCHITECTURE.md has a ports table row for each of them", () => {
        const doc = architectureDoc();
        expect(ports.filter((port) => !hasRowFor(doc, port))).toEqual([]);
      });
    });
  });

  Rule("Tutors shall cite every dependency rule of .dependency-cruiser.cjs in ARCHITECTURE.md by name.", ({ RuleScenario }) => {
    RuleScenario("Every forbidden rule is in the dependency rules table", ({ Given, Then }) => {
      let names: string[] = [];
      Given("the names of the forbidden rules in .dependency-cruiser.cjs", () => {
        names = forbiddenRuleNames();
        expect(names).toContain("domain-self-contained");
      });
      Then("ARCHITECTURE.md cites each of them in backticks", () => {
        const doc = architectureDoc();
        expect(names.filter((name) => !doc.includes(`\`${name}\``))).toEqual([]);
      });
    });
  });

  Rule("Tutors shall name in ARCHITECTURE.md every Supabase table and channel a package reads or writes, with the adapter that owns it.", ({ RuleScenario }) => {
    RuleScenario("Every table a package queries is in the data ownership table", ({ Given, Then, And }) => {
      let tables: string[] = [];
      Given("the Supabase tables the adapters, the time library and the apps query", () => {
        tables = queriedTables();
        expect(tables).toContain("learning_records");
      });
      Then("ARCHITECTURE.md has a data ownership row for each of them", () => {
        expect(missingFromAuthority(architectureDoc(), { packages: [], tables })).toEqual([]);
      });
      And("ARCHITECTURE.md has a data ownership row for the platform-wide presence channel", async () => {
        const { ALL_COURSES_CHANNEL } = await import("../../../../packages/adapters/driven/realtime-supabase/src/index.ts");
        expect(hasRowFor(architectureDoc(), `Realtime channel \`${ALL_COURSES_CHANNEL}\``) || architectureDoc().includes(`| Realtime channel \`${ALL_COURSES_CHANNEL}\``)).toBe(true);
      });
    });
  });

  Rule("Tutors shall keep the requirements table of ARCHITECTURE.md and the hexagonal-architecture feature in agreement, citing every Rule of the feature and no Rule id that exists in no feature.", ({ RuleScenario }) => {
    RuleScenario("The architecture requirements table and the feature agree", ({ Given, Then, And }) => {
      let ids: string[] = [];
      Given("the Rule ids of the hexagonal-architecture feature", () => {
        ids = ruleIdsOf(readFileSync(resolve(REPO_ROOT, "tests/bdd/features/developer/hexagonal-architecture.feature"), "utf8"));
        expect(ids).toContain("0340");
      });
      Then("ARCHITECTURE.md's requirements table lists each of them", () => {
        const cited = citedRuleIds(architectureDoc());
        expect(ids.filter((id) => !cited.includes(id))).toEqual([]);
      });
      And("every Rule id ARCHITECTURE.md cites is a Rule in some feature", () => {
        const known = allFeatureRuleIds();
        expect(citedRuleIds(architectureDoc()).filter((id) => !known.has(id))).toEqual([]);
      });
    });
  });

  Rule("If a package, port, rule or table is added without its line in ARCHITECTURE.md, then tutors shall fail the architecture check naming what is missing.", ({ RuleScenario }) => {
    RuleScenario("A document that leaves a package and a table out is told which", ({ Given, When, Then }) => {
      let doc = "";
      let missing: string[] = [];
      Given("an architecture document that names {string} and {string} only", (_ctx: unknown, pkg: string, table: string) => {
        doc = `| \`${pkg}\` | ring |\n| \`${table}\` | store-supabase |\n`;
      });
      When("it is checked against the packages {string} and the tables {string}", (_ctx: unknown, packages: string, tables: string) => {
        missing = missingFromAuthority(doc, { packages: packages.split(",").map((s) => s.trim()), tables: tables.split(",").map((s) => s.trim()) });
      });
      Then("the check names {string} and {string} as missing", (_ctx: unknown, a: string, b: string) => {
        expect(missing).toEqual([a, b]);
      });
    });
  });
});
