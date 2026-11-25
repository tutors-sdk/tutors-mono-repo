import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { afterAll, expect, vi } from "vitest";
import { buildDashboard, PATTERN_GUIDE, PATTERNS, renderDashboard, type DashboardData, type DashboardRule } from "../../../../scripts/ears-dashboard.ts";
import { gitIn } from "../../../../scripts/checks/lib/rules-index.ts";

// Building the page runs the whole audit and, since a ref, git; a full parallel run can pass the 5s default.
vi.setConfig({ testTimeout: 30_000 });

const feature = await loadFeature("tests/bdd/features/developer/ears-dashboard.feature");

const SEARCH_FEATURE = "tests/bdd/features/student/search.feature";
const CARDS_FEATURE = "tests/bdd/features/ui/cards.feature";

const rule = (id: string, tags: string, title: string, scenario: string, steps: string[]) =>
  `  @rule-${id} ${tags}\n  Rule: ${title}\n\n    Scenario: ${scenario}\n${steps.map((s) => `      ${s}`).join("\n")}\n`;

const RULES = {
  "0001": rule("0001", "@ears-event-driven", "When a student searches a course, the reader shall list the topics whose text matches the search term.", "A search lists the matching topics", [
    "When a student searches for \"loops\"",
    "Then the topics about loops are listed"
  ]),
  "0002": rule("0002", "@ears-ubiquitous", "The reader shall show a search box on every course page.", "Course pages show a search box", ["When a student opens a course", "Then a search box is shown"]),
  "0004": rule("0004", "@ears-event-driven", "When a student clears the search box, the reader shall list every topic.", "Clearing the search lists every topic", [
    "When a student clears the search box",
    "Then every topic is listed"
  ])
} as const;

const searchFeature = (rules: string[]) => `@student\nFeature: Search\n\n${rules.join("\n")}`;

describeFeature(feature, ({ Rule }) => {
  let root: string | undefined;
  let data: DashboardData;
  let page: string;

  // Every step is its own test, so the repository is removed when the next scenario writes one, and after the feature.
  const removeRepository = () => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = undefined;
  };
  afterAll(removeRepository);

  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(root!, path)), { recursive: true });
    writeFileSync(join(root!, path), text);
  };
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const searchRules = new Map<string, string>([
    ["0001", RULES["0001"]],
    ["0002", RULES["0002"]]
  ]);
  const writeSearch = () => write(SEARCH_FEATURE, searchFeature([...searchRules.values()]));

  const exampleRepository = () => {
    removeRepository();
    root = mkdtempSync(join(tmpdir(), "ears-dashboard-"));
    searchRules.clear();
    searchRules.set("0001", RULES["0001"]).set("0002", RULES["0002"]);
    writeSearch();
    write(
      "tests/bdd/steps/student/search.steps.ts",
      [
        'const feature = await loadFeature("tests/bdd/features/student/search.feature");',
        "describeFeature(feature, ({ Rule }) => {",
        `  Rule("${RULES["0001"].match(/Rule: (.*)/)![1]}", () => {});`,
        `  Rule("${RULES["0002"].match(/Rule: (.*)/)![1]}", () => {});`,
        `  Rule("${RULES["0004"].match(/Rule: (.*)/)![1]}", () => {});`,
        "});",
        ""
      ].join("\n")
    );
    write(
      CARDS_FEATURE,
      `@ui @reader\nFeature: Cards\n\n${rule("0003", "@ears-ubiquitous", "The reader shall show each resource card with its title.", "A card shows its title", ["When a student opens a topic", "Then each card shows its title"])}`
    );
    write("apps/reader/tests/e2e/cards.spec.ts", 'test("A card shows its title", { tag: "@rule-0003" }, async () => {});\n');
    write("tests/bdd/ears-audit-baseline.txt", "# baseline\n");
  };
  const build = (since?: string) => {
    data = buildDashboard(root!, { since, git: since ? gitIn(root!) : undefined, ref: "main", now: new Date("2026-10-15T00:00:00Z") });
  };
  const ruleById = (id: string): DashboardRule => {
    const found = data.features.flatMap((f) => f.rules).filter((r) => r.id === id);
    expect(found, `Rule ${id}`).toHaveLength(1);
    return found[0]!;
  };

  Rule("Tutors shall list every Rule under tests/bdd/features on the EARS dashboard with its id, its EARS pattern, its feature file and the titles of its scenarios.", ({ RuleScenario }) => {
    RuleScenario("Every Rule is listed with its pattern and scenarios", ({ Given, When, Then, And }) => {
      Given("the example repository", exampleRepository);
      When("the EARS dashboard is built", () => build());
      Then("it lists Rules {string}", (_ctx, ids: string) => {
        expect(data.features.flatMap((f) => f.rules.map((r) => r.id)).sort()).toEqual(ids.split(/,\s*/));
      });
      And("Rule {string} is {string} in {string}", (_ctx, id: string, pattern: string, file: string) => {
        expect(ruleById(id).pattern).toBe(pattern);
        expect(data.features.find((f) => f.rules.includes(ruleById(id)))?.file).toBe(file);
      });
      And("Rule {string} has the scenario {string}", (_ctx, id: string, title: string) => {
        expect(ruleById(id).scenarios.map((s) => s.title)).toContain(title);
      });
    });
  });

  Rule(
    "When a Rule has an EARS audit finding, tutors shall show the finding's code on that Rule on the EARS dashboard and say whether the audit baseline allows it.",
    ({ RuleScenario }) => {
      RuleScenario("A new finding marks its Rule as failing", ({ Given, When, Then, And }) => {
        Given("the example repository", exampleRepository);
        And("Rule {string} says {string} instead of {string}", (_ctx, id: string, word: string, shall: string) => {
          searchRules.set(id, searchRules.get(id)!.replace(` ${shall} `, ` ${word} `));
          writeSearch();
        });
        When("the EARS dashboard is built", () => build());
        Then("Rule {string} fails the audit with {string}", (_ctx, id: string, code: string) => {
          const found = ruleById(id);
          expect(found.status).toBe("failing");
          expect(found.violations.filter((v) => !v.baselined).map((v) => v.code)).toContain(code);
        });
        And("Rule {string} passes the audit", (_ctx, id: string) => {
          expect(ruleById(id).status).toBe("clean");
          expect(ruleById(id).violations).toEqual([]);
        });
      });

      RuleScenario("A finding the baseline lists is shown as allowed", ({ Given, When, Then, And }) => {
        Given("the example repository", exampleRepository);
        And("a feature {string} with a scenario outside a Rule, listed in the audit baseline", (_ctx, file: string) => {
          write(file, "Feature: Legacy\n\n  Scenario: An old scenario\n    When something happens\n    Then something is shown\n");
          write("tests/bdd/steps/student/legacy.steps.ts", `const feature = await loadFeature("${file}");\n`);
          write("tests/bdd/ears-audit-baseline.txt", `no-rule: ${file}\n`);
        });
        When("the EARS dashboard is built", () => build());
        Then("the feature {string} shows {string} as allowed by the baseline", (_ctx, file: string, code: string) => {
          const legacy = data.features.find((f) => f.file === file);
          expect(legacy?.looseScenarios.map((s) => s.title)).toEqual(["An old scenario"]);
          expect(legacy?.violations).toEqual([expect.objectContaining({ code, baselined: true })]);
        });
      });
    }
  );

  Rule(
    "Tutors shall name on the EARS dashboard what proves each Rule, naming the steps file that binds it or the Playwright test that proves each scenario of a @ui Rule.",
    ({ RuleScenario }) => {
      RuleScenario("A Rule names its steps file and a @ui Rule its Playwright test", ({ Given, When, Then, And }) => {
        Given("the example repository", exampleRepository);
        When("the EARS dashboard is built", () => build());
        Then("Rule {string} is proved by the steps file {string}", (_ctx, id: string, file: string) => {
          expect(ruleById(id).proofs).toEqual([{ kind: "steps", file, line: 3 }]);
        });
        And("Rule {string} is proved by the Playwright test {string} for {string}", (_ctx, id: string, file: string, scenario: string) => {
          expect(ruleById(id).proofs).toEqual([{ kind: "playwright", file, line: 1, scenario }]);
        });
      });
    }
  );

  Rule(
    "When the EARS dashboard is built since a git ref, tutors shall mark each Rule added or changed after that ref and list each Rule removed after it.",
    ({ RuleScenario }) => {
      RuleScenario("Rules added, changed and removed since a ref are marked", ({ Given, When, Then, And }) => {
        Given("the example repository committed and tagged {string}", (_ctx, tag: string) => {
          exampleRepository();
          git("init", "-q", "-b", "main");
          git("config", "user.email", "test@example.com");
          git("config", "user.name", "Test");
          git("config", "commit.gpgsign", "false");
          git("add", "-A");
          git("commit", "-q", "-m", "v1");
          git("tag", tag);
        });
        And("after {string} Rule {string} is reworded, Rule {string} is deleted and Rule {string} is added", (_ctx, _tag: string, reworded: string, deleted: string, added: string) => {
          searchRules.set(reworded, searchRules.get(reworded)!.replace("the search term", "the search terms"));
          searchRules.delete(deleted);
          searchRules.set(added, RULES[added as keyof typeof RULES]);
          writeSearch();
        });
        When("the EARS dashboard is built since {string}", (_ctx, ref: string) => build(ref));
        Then("Rule {string} is marked {string}", (_ctx, id: string, change: string) => {
          expect(ruleById(id).change).toBe(change);
        });
        And("Rule {string} is marked {string}", (_ctx, id: string, change: string) => {
          expect(ruleById(id).change).toBe(change);
        });
        And("Rule {string} is listed as removed", (_ctx, id: string) => {
          expect(data.removed.map((r) => r.id)).toEqual([id]);
        });
        And("Rule {string} is not marked", (_ctx, id: string) => {
          expect(ruleById(id).change).toBeUndefined();
        });
      });
    }
  );

  Rule(
    "Tutors shall show on the EARS dashboard, for each EARS pattern, the shortest Rule of that pattern that passes the audit as the example of that pattern.",
    ({ RuleScenario }) => {
      RuleScenario("Each pattern takes a passing Rule from the features as its example", ({ Given, When, Then, And }) => {
        const exampleOf = (pattern: string) => {
          const at = data.examples[pattern as keyof typeof data.examples];
          return at && data.features[at.featureIndex]!.rules[at.ruleIndex]!.id;
        };
        Given("the example repository", exampleRepository);
        When("the EARS dashboard is built", () => build());
        Then("the example of {string} is Rule {string}", (_ctx, pattern: string, id: string) => {
          expect(exampleOf(pattern)).toBe(id);
        });
        And("the example of {string} is Rule {string}", (_ctx, pattern: string, id: string) => {
          // 0002 and 0003 are both ubiquitous and pass; 0003 is the shorter block.
          expect(exampleOf(pattern)).toBe(id);
        });
        And("the page shows the EARS template of every pattern", () => {
          const html = renderDashboard(data);
          for (const pattern of PATTERNS) expect(html).toContain(JSON.stringify(PATTERN_GUIDE[pattern].ears).replace(/</g, "\\u003c"));
        });
      });
    }
  );

  Rule(
    "If a feature file contains the text </script>, then tutors shall embed it in the EARS dashboard page without closing the page's script element.",
    ({ RuleScenario }) => {
      RuleScenario("Feature text cannot end the page's script", ({ Given, When, Then, And }) => {
        Given("the example repository", exampleRepository);
        And("Rule {string} has a scenario step that says {string}", (_ctx, id: string, text: string) => {
          searchRules.set(id, `${searchRules.get(id)!.trimEnd()}\n      And the page says "${text}"\n`);
          writeSearch();
        });
        When("the EARS dashboard page is rendered", () => {
          build();
          page = renderDashboard(data);
        });
        Then("the page has exactly one {string}", (_ctx, closing: string) => {
          expect(page.split(closing)).toHaveLength(2);
        });
        And("the page's data still holds {string}", (_ctx, text: string) => {
          const json = page.slice(page.indexOf("const D = ") + "const D = ".length, page.indexOf(";\nconst $ ="));
          const parsed = JSON.parse(json) as DashboardData;
          expect(parsed.features.flatMap((f) => f.rules).find((r) => r.id === "0002")?.source).toContain(text);
        });
      });
    }
  );
});
