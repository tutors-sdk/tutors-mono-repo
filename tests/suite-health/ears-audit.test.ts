import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  annotation,
  auditDocument,
  auditFiles,
  baselineKey,
  classifyTitle,
  DEFAULT_CONFIG,
  duplicateIds,
  evaluate,
  findFeatureFiles,
  indexSteps,
  indexUiTests,
  loadConfig,
  nextRuleId,
  orphanUiTests,
  parseArgs,
  shrinkBaseline,
  type Violation
} from "../../scripts/checks/ears-audit.ts";
import { parseGherkin, ruleId } from "../../scripts/checks/lib/gherkin-rules.ts";
import { readText } from "../../scripts/checks/lib/repo.ts";

const ROOT = resolve(__dirname, "fixtures/ears-audit/root");
const feature = (name: string) => `tests/bdd/features/student/${name}.feature`;
const read = (name: string) => parseGherkin(readText(resolve(ROOT, feature(name))));
const lines = (...rows: string[]) => rows.join("\n");

/** Codes per Rule, in file order, for a fixture audited without steps files. */
const codesBySubject = (name: string) => {
  const found = new Map<string, string[]>();
  for (const rule of read(name).rules) found.set(ruleId(rule) ? `@rule-${ruleId(rule)}` : rule.title, []);
  for (const v of auditDocument(feature(name), read(name))) found.set(v.subject, [...(found.get(v.subject) ?? []), v.code]);
  return found;
};

describe("gherkin rule reader", () => {
  it("reads tags, Rule titles and the scenarios beneath each Rule, with line numbers", () => {
    const doc = parseGherkin(
      lines(
        "@student",
        "Feature: F",
        "  Background:",
        "    Given x",
        "",
        "  @rule-0007 @ears-event-driven",
        "  Rule: When a, tutors shall b.",
        "    Some description",
        "    @active",
        "    Scenario: one",
        "      Given y",
        "    Scenario Outline: two",
        "      When <n>",
        "      Examples:",
        "        | n |",
        "        | 1 |"
      )
    );
    expect(doc.featureName).toBe("F");
    expect(doc.featureTags).toEqual(["@student"]);
    expect(doc.rules).toHaveLength(1);
    expect(doc.rules[0]).toMatchObject({ title: "When a, tutors shall b.", line: 7, tags: ["@rule-0007", "@ears-event-driven"] });
    expect(doc.rules[0].scenarios.map((s) => [s.title, s.tags, s.outline])).toEqual([
      ["one", ["@active"], false],
      ["two", [], true]
    ]);
    expect(ruleId(doc.rules[0])).toBe("0007");
  });

  it("keeps scenarios outside any Rule apart and ignores doc strings and comments", () => {
    const doc = parseGherkin(lines("Feature: F", "  # Rule: not a rule", "  Scenario: loose", "    Given a doc string:", '      """', "      Rule: also not a rule", '      """'));
    expect(doc.rules).toEqual([]);
    expect(doc.looseScenarios.map((s) => s.title)).toEqual(["loose"]);
  });
});

describe("EARS audit: Rule shape", () => {
  it("passes a feature that writes every pattern well", () => {
    expect(auditDocument(feature("good"), read("good"))).toEqual([]);
  });

  it("classifies the sentence form", () => {
    expect(classifyTitle("The reader shall x.")).toBe("ubiquitous");
    expect(classifyTitle("When a, the reader shall x.")).toBe("event-driven");
    expect(classifyTitle("While a, the reader shall x.")).toBe("state-driven");
    expect(classifyTitle("If a, then the reader shall x.")).toBe("unwanted");
    expect(classifyTitle("Where a, the reader shall x.")).toBe("optional");
  });

  it("names each thing wrong with a Rule, one code per fault", () => {
    expect(Object.fromEntries(codesBySubject("bad"))).toEqual({
      "The catalogue shall list courses.": ["rule-id"],
      "The catalogue shall list courses with a short id.": ["rule-id"],
      "@rule-0801": [],
      "@rule-0900": ["shall-count"],
      "@rule-0901": ["shall-count", "obligation-keyword"],
      "@rule-0902": ["vague-language"],
      "@rule-0903": ["system-name"],
      "@rule-0904": ["ears-form"],
      "@rule-0905": ["ears-form"],
      "@rule-0906": ["ears-tag-missing"],
      "@rule-0907": ["ears-tag-mismatch"],
      "@rule-0908": ["no-scenarios"],
      "@rule-0909": ["dual-scenarios"]
    });
  });

  it("explains a fault in words an author can act on", () => {
    const messages = auditDocument(feature("bad"), read("bad"))
      .filter((v) => ["@rule-0902", "@rule-0903", "@rule-0906"].includes(v.subject))
      .map((v) => v.message);
    expect(messages).toEqual([
      'Rule title uses vague language ("quickly", "appropriately"); say what is observable.',
      'The word before "shall" must be a system name: tutors, the reader, the catalogue, the live dashboard, the time dashboard.',
      "Rule has no @ears-* tag; its wording is ubiquitous, so it takes @ears-ubiquitous."
    ]);
  });

  it("takes the vague and obligation lists from configuration", () => {
    const doc = parseGherkin(
      lines("Feature: F", "  @rule-0001 @ears-ubiquitous", "  Rule: The catalogue shall list courses swiftly, whatever the widget must do.", "    Scenario: s", "      Then x")
    );
    const config = { ...DEFAULT_CONFIG, vagueTerms: [...DEFAULT_CONFIG.vagueTerms, "swiftly"], wrongObligations: [] };
    expect(auditDocument("f.feature", doc).map((v) => v.code)).toEqual(["obligation-keyword"]);
    expect(auditDocument("f.feature", doc, { config }).map((v) => v.code)).toEqual(["vague-language"]);
    expect(loadConfig(ROOT)).toEqual(DEFAULT_CONFIG);
  });

  it("does not mistake a word that merely contains a banned one", () => {
    const doc = parseGherkin(
      lines("Feature: F", "  @rule-0001 @ears-ubiquitous", "  Rule: The catalogue shall list something that is mayhem-free and easy-to-read.", "    Scenario: s", "      Then x")
    );
    expect(auditDocument("f.feature", doc)).toEqual([]);
  });

  it("flags scenarios outside a Rule once per file", () => {
    expect(auditDocument(feature("legacy"), read("legacy")).map(baselineKey)).toEqual([`no-rule: ${feature("legacy")}`]);
  });
});

describe("EARS audit: ids", () => {
  const rule = (id: string) => parseGherkin(lines("Feature: A", `  @rule-${id} @ears-ubiquitous`, "  Rule: The reader shall a.", "    Scenario: s", "      Then x"));

  it("reports every Rule that shares an id, across files", () => {
    const found = duplicateIds([
      { file: "a.feature", doc: rule("0042") },
      { file: "b.feature", doc: rule("0042") }
    ]);
    expect(found.map((v) => [v.code, v.file, v.subject])).toEqual([
      ["rule-id-duplicate", "a.feature", "@rule-0042"],
      ["rule-id-duplicate", "b.feature", "@rule-0042"]
    ]);
  });

  it("refuses a retired id, and hands out the id after the highest one used", () => {
    expect(auditDocument("a.feature", rule("0007"), { retired: new Set(["0007"]) }).map((v) => v.code)).toEqual(["rule-id-retired"]);
    expect(nextRuleId(ROOT)).toBe("0951");
  });
});

describe("EARS audit: binding", () => {
  const steps = indexSteps(ROOT);

  it("reads which steps files load which feature", () => {
    expect([...steps.byFeature.keys()].sort()).toEqual([feature("binding"), feature("good")]);
  });

  it("passes a feature whose steps file binds every Rule title", () => {
    expect(auditDocument(feature("good"), read("good"), { steps })).toEqual([]);
  });

  it("flags a feature no steps file loads, a Rule none binds and a Rule that is skipped", () => {
    expect(auditDocument(feature("unbound"), read("unbound"), { steps }).map((v) => v.code)).toEqual(["unbound-feature"]);
    expect(auditDocument(feature("binding"), read("binding"), { steps }).map((v) => [v.code, v.subject])).toEqual([
      ["unbound-rule", "@rule-0910"],
      ["rule-not-run", "@rule-0911"]
    ]);
  });
});

describe("EARS audit: browser-proved (@ui) features", () => {
  const uiFeature = "tests/bdd/features/ui/ui.feature";
  const doc = parseGherkin(readText(resolve(ROOT, uiFeature)));
  const uiTests = indexUiTests(ROOT);

  it("reads Playwright tests' titles, tags, modifiers and lines under apps/<app>/tests/e2e", () => {
    expect(uiTests.map((t) => [t.title, t.tags, t.modifier ?? "", t.line])).toEqual([
      ["proved in a browser", ["@rule-0920"], "", 3],
      ["skipped in a browser", ["@smoke", "@rule-0922"], "skip", 4],
      ["renamed since the scenario was written", ["@rule-0920"], "", 5],
      ["cites a Rule that is not in a @ui feature", ["@rule-0999"], "", 6],
      ["carries no Rule id", ["@smoke"], "", 7]
    ]);
    expect(uiTests[0].file).toBe("apps/reader/tests/e2e/ui.spec.ts");
  });

  it("binds each scenario to a test with its title and Rule id, and needs no steps file", () => {
    expect(auditDocument(uiFeature, doc, { steps: indexSteps(ROOT), uiTests }).map((v) => [v.code, v.subject])).toEqual([
      ["unproved-scenario", "@rule-0921"],
      ["rule-not-run", "@rule-0922"]
    ]);
  });

  it("flags a test whose title is not a scenario of the Rule it cites, or that cites an unknown Rule", () => {
    expect(orphanUiTests([{ file: uiFeature, doc }], uiTests).map((v) => v.subject)).toEqual([
      "@rule-0920 renamed since the scenario was written",
      "@rule-0999 cites a Rule that is not in a @ui feature"
    ]);
  });
});

describe("EARS audit: the whole fixture root", () => {
  it("audits every feature under tests/bdd/features and raises each violation code", () => {
    const files = findFeatureFiles(ROOT);
    expect(files.map((f) => f.split(/[\\/]/).pop())).toEqual(["bad.feature", "binding.feature", "good.feature", "legacy.feature", "unbound.feature", "ui.feature"]);
    const codes = new Set(auditFiles(files, ROOT).map((v) => v.code));
    expect([...codes].sort()).toEqual(
      [
        "dual-scenarios",
        "ears-form",
        "ears-tag-mismatch",
        "ears-tag-missing",
        "no-rule",
        "no-scenarios",
        "obligation-keyword",
        "orphan-ui-test",
        "rule-id",
        "rule-id-duplicate",
        "rule-not-run",
        "shall-count",
        "system-name",
        "unbound-feature",
        "unbound-rule",
        "unproved-scenario",
        "vague-language"
      ].sort()
    );
  });
});

describe("EARS audit: baseline ratchet", () => {
  const violation = (subject: string, code: Violation["code"] = "shall-count"): Violation => ({ code, file: "a.feature", line: 3, subject, message: "m" });

  it("fails only on violations the baseline does not list", () => {
    const known = violation("@rule-0001");
    const fresh = violation("@rule-0002");
    const report = evaluate([known, fresh], [baselineKey(known)]);
    expect(report.added).toEqual([fresh]);
    expect(report.baselined).toEqual([known]);
    expect(report.stale).toEqual([]);
  });

  it("treats a baseline line whose violation is gone as stale, so the baseline can only shrink", () => {
    const report = evaluate([], ["shall-count: a.feature :: @rule-0001"]);
    expect(report.stale).toEqual(["shall-count: a.feature :: @rule-0001"]);
    expect(report.added).toEqual([]);
  });

  it("without a baseline every violation is new", () => {
    expect(evaluate([violation("@rule-0001")], undefined).added).toHaveLength(1);
  });

  it("rewrites a baseline without its fixed entries, keeping comments, and never adds one", () => {
    const text = "# header\nshall-count: a.feature :: @rule-0001\nshall-count: a.feature :: @rule-0002\n";
    expect(shrinkBaseline(text, [violation("@rule-0002"), violation("@rule-0003")])).toBe("# header\nshall-count: a.feature :: @rule-0002\n");
  });

  it("keys a file-level violation without a subject", () => {
    expect(baselineKey({ code: "no-rule", file: "a.feature", subject: "" })).toBe("no-rule: a.feature");
  });
});

describe("EARS audit: command line and CI annotations", () => {
  it("emits a GitHub error annotation on the file and line, escaping what the runner treats as syntax", () => {
    expect(annotation({ code: "shall-count", file: "tests/bdd/features/a,b.feature", line: 12, subject: "s", message: "50% off\nsecond line" })).toBe(
      "::error file=tests/bdd/features/a%2Cb.feature,line=12,title=EARS shall-count::50%25 off%0Asecond line"
    );
  });

  it("annotates automatically under GitHub Actions and reads the flags", () => {
    expect(parseArgs([], { GITHUB_ACTIONS: "true" }).github).toBe(true);
    expect(parseArgs([], {}).github).toBe(false);
    expect(parseArgs(["--strict", "--baseline", "x.txt", "a.feature"], {})).toMatchObject({ strict: true, baseline: "x.txt", paths: ["a.feature"] });
    expect(() => parseArgs(["--bogus"], {})).toThrow(/unknown option/);
  });
});
