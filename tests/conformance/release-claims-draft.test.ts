import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ARTEFACTS, validateClaimsText } from "../../scripts/checks/release-claims.ts";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";
import { diffRules, gitIn, indexRules, rulesAtRef } from "../../scripts/checks/lib/rules-index.ts";
import { draftClaims, parseArgs, renderDraft } from "../../scripts/release-claims-draft.ts";

const feature = (rules: string[]) => `Feature: F\n\n${rules.join("\n")}`;
const rule = (id: string, title: string, then: string) =>
  `  @rule-${id} @ears-ubiquitous\n  Rule: ${title}\n\n    Scenario: proof ${id}\n      When something happens\n      Then ${then}\n`;

const ONE = rule("0001", "The reader shall show a title.", "the title is shown");
const TWO = rule("0002", "The reader shall show a footer.", "the footer is shown");
const FOUR = rule("0004", 'The reader shall show a "quoted" heading.', "the heading is shown");

describe("release claims draft", () => {
  let dir: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "claims-draft-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    write("tests/bdd/features/student/a.feature", feature([ONE, TWO]));
    write("tests/bdd/features/student/b.feature", feature([FOUR]));
    git("add", "-A");
    git("commit", "-q", "-m", "prod");
    git("tag", "v1.0.0");

    // The release: 0001 changes its expected result, 0002 is removed, 0003 is added, and 0004 moves to another file unchanged.
    write("tests/bdd/features/student/a.feature", feature([rule("0001", "The reader shall show a title.", "the title is shown in bold"), rule("0003", "When a student opens a lab, the reader shall show its reading time.", "the time is shown")]));
    renameSync(join(dir, "tests/bdd/features/student/b.feature"), join(dir, "tests/bdd/features/c.feature"));
    git("add", "-A");
    git("commit", "-q", "-m", "rc");
    git("tag", "v1.1.0-rc.1");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reads the Rules at a git ref", () => {
    const rules = rulesAtRef("v1.0.0", gitIn(dir));
    expect([...rules.keys()]).toEqual(["0001", "0002", "0004"]);
    expect(rules.get("0004")).toMatchObject({ title: 'The reader shall show a "quoted" heading.', file: "tests/bdd/features/student/b.feature" });
  });

  it("diffs Rules by id: added, changed by any edit to the block, removed, and not a move", () => {
    const diff = diffRules(rulesAtRef("v1.0.0", gitIn(dir)), rulesAtRef("v1.1.0-rc.1", gitIn(dir)));
    expect(diff.added.map((r) => r.id)).toEqual(["0003"]);
    expect(diff.changed.map((r) => r.id)).toEqual(["0001"]);
    expect(diff.removed.map((r) => r.id)).toEqual(["0002"]);
  });

  it("prints a stub per added or changed Rule with the reason filled in and artefact and scope left as TODO", () => {
    const draft = draftClaims("v1.0.0", "v1.1.0-rc.1", gitIn(dir));
    expect(draft).toContain("# Draft claims for v1.0.0..v1.1.0-rc.1: 1 Rule(s) added, 1 changed, 1 removed.");
    expect(draft).toContain('    reason: "Rule 0001: The reader shall show a title."');
    expect(draft).toContain('    reason: "Rule 0003: When a student opens a lab, the reader shall show its reading time."');
    expect(draft.match(/artefact: TODO/g)).toHaveLength(2);
    expect(draft.match(/scope: TODO/g)).toHaveLength(2);
    expect(draft).toContain("#   Rule 0002: The reader shall show a footer.");
    expect(draft).not.toContain("Rule 0004");
  });

  it("lists every artefact the pre-check accepts in the TODO hint, and the help says how an older harness treats `rule`", () => {
    const draft = draftClaims("v1.0.0", "v1.1.0-rc.1", gitIn(dir));
    const hint = draft.split(/\r?\n/).find((line) => line.includes("artefact: TODO")) ?? "";
    for (const artefact of ARTEFACTS) expect(hint, artefact).toContain(artefact);
    const source = readFileSync(join(REPO_ROOT, "scripts/release-claims-draft.ts"), "utf8");
    expect(source).toContain("ignores the unknown `rule` key");
    expect(source).not.toContain("rejects a claim with an unknown field");
  });

  it("is not a valid claims file until the author replaces every TODO, and its reasons resolve", () => {
    const draft = draftClaims("v1.0.0", "v1.1.0-rc.1", gitIn(dir));
    const errors = validateClaimsText(draft, new Set(["0001", "0003"]));
    expect(errors).toEqual([expect.stringContaining("claims[0]: artefact must be one of"), expect.stringContaining("claims[1]: artefact must be one of")]);

    const filled = draft.replaceAll("artefact: TODO", "artefact: dom").replaceAll("scope: TODO", 'scope: "reader:*"');
    expect(validateClaimsText(filled, new Set(["0001", "0003"]))).toEqual([]);
  });

  it("drafts the `rule` field form with --rule, and that draft resolves once the TODOs are filled in", () => {
    const draft = draftClaims("v1.0.0", "v1.1.0-rc.1", gitIn(dir), { asField: true });
    expect(draft).toContain('    rule: "0001" # The reader shall show a title.');
    expect(draft).toContain('    rule: "0003" # When a student opens a lab, the reader shall show its reading time.');
    expect(draft).not.toContain("    reason:");
    const filled = draft.replaceAll("artefact: TODO", "artefact: dom").replaceAll("scope: TODO", 'scope: "reader:*"');
    expect(validateClaimsText(filled, new Set(["0001", "0003"]))).toEqual([]);
    expect(validateClaimsText(filled, new Set(["0001"]))).toEqual([expect.stringContaining("claims[0]: rule 0003 is not defined")]);
  });

  it("writes an empty claims list when no Rule changed", () => {
    const same = rulesAtRef("v1.0.0", gitIn(dir));
    expect(renderDraft(diffRules(same, same), "a", "b")).toContain("claims: []");
  });

  it("needs both refs", () => {
    expect(parseArgs(["--from", "v1", "--to", "rc"])).toEqual({ from: "v1", to: "rc", asField: false });
    expect(parseArgs(["--from", "v1", "--to", "rc", "--rule"])).toEqual({ from: "v1", to: "rc", asField: true });
    expect(() => parseArgs(["--from", "v1"])).toThrow(/usage/);
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown argument/);
  });

  it("skips a Rule without an id, which is an audit finding, not something to claim", () => {
    const rules = indexRules([{ path: "a.feature", text: "Feature: F\n  Rule: The reader shall show a title.\n    Scenario: s\n      Then x\n" }]);
    expect(rules.size).toBe(0);
  });
});
