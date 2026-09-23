import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { validateClaimsText } from "../../scripts/checks/release-claims.ts";
import { REPO_ROOT } from "../../scripts/checks/lib/repo.ts";
import { gitIn } from "../../scripts/checks/lib/rules-index.ts";
import { parseArgs, renderRulesJson, rulesJsonAtRef, type RulesJson } from "../../scripts/release-rules.ts";

const feature = (rules: string[]) => `Feature: F\n\n${rules.join("\n")}`;
const rule = (id: string, title: string, then: string) =>
  `  @rule-${id} @ears-ubiquitous\n  Rule: ${title}\n\n    Scenario: proof ${id}\n      When something happens\n      Then ${then}\n`;

describe("release rules.json", () => {
  let dir: string;
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const commit = (message: string, tag: string) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
    git("tag", tag);
  };
  const at = (ref: string): RulesJson => JSON.parse(rulesJsonAtRef(ref, gitIn(dir))) as RulesJson;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "release-rules-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");

    // v1: a Rule with a quote and an accent in its title, one with a four-digit id that sorts after 0031 as a number
    // and as text, one without an id (an audit finding, not something a claim can cite).
    write(
      "tests/bdd/features/student/a.feature",
      feature([
        rule("1234", "The reader shall show a footer.", "the footer is shown"),
        rule("0031", 'The reader shall show a "quoted" heading, café.', "the heading is shown"),
        "  Rule: The reader shall show something with no id.\n\n    Scenario: proof\n      Then x\n"
      ])
    );
    write("tests/bdd/features/tutor/b.feature", feature([rule("0002", "The catalogue shall list courses.", "courses are listed")]));
    write("tests/bdd/features/README.md", "not a feature");
    commit("v1", "v1");

    // v2: 0031 reworded, 0002 moves file with CRLF endings, extra spacing and a comment, 0044 added.
    write("tests/bdd/features/student/a.feature", feature([rule("1234", "The reader shall show a footer.", "the footer is shown"), rule("0031", 'The reader shall show a "quoted" heading, café.', "the heading is shown in bold")]));
    rmSync(join(dir, "tests/bdd/features/tutor/b.feature"));
    write(
      "tests/bdd/features/c.feature",
      feature([rule("0002", "The catalogue shall list courses.", "courses are listed").replace(/\n/g, "\r\n").replace("Scenario:", "# a comment\r\n    Scenario:").replace("When something", "When   something"), rule("0044", "The reader shall poll presence.", "presence is polled")])
    );
    commit("v2", "v2");
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("is { version, rules: { id: { title, digest } } }, sorted by id, for a ref", () => {
    const text = rulesJsonAtRef("v1", gitIn(dir));
    const parsed = JSON.parse(text) as RulesJson;
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed).sort()).toEqual(["rules", "version"]);
    expect(Object.keys(parsed.rules).sort()).toEqual(["0002", "0031", "1234"]);
    expect(parsed.rules["0031"]).toEqual({ title: 'The reader shall show a "quoted" heading, café.', digest: expect.stringMatching(/^[0-9a-f]{40}$/) });
    expect(Object.keys(parsed.rules["0031"]).sort()).toEqual(["digest", "title"]);
    // the id of a Rule that has none is not published
    expect(text).not.toContain("no id");
  });

  it("lists ids in the text in code-unit order, though an object would put 1234 first", () => {
    const text = rulesJsonAtRef("v1", gitIn(dir));
    const order = [...text.matchAll(/^ {4}"(\d{4})":/gm)].map((m) => m[1]);
    expect(order).toEqual(["0002", "0031", "1234"]);
    expect(Object.keys(JSON.parse(text).rules)).toEqual(["1234", "0002", "0031"]);
  });

  it("is byte-for-byte the same on every run, and ends with one newline", () => {
    const first = rulesJsonAtRef("v2", gitIn(dir));
    expect(rulesJsonAtRef("v2", gitIn(dir))).toBe(first);
    expect(first.endsWith("}\n")).toBe(true);
    expect(first).not.toMatch(/\r/);
    expect(first).toBe(
      [
        "{",
        '  "version": 1,',
        '  "rules": {',
        `    "0002": { "title": "The catalogue shall list courses.", "digest": ${JSON.stringify(at("v2").rules["0002"].digest)} },`,
        `    "0031": { "title": "The reader shall show a \\"quoted\\" heading, café.", "digest": ${JSON.stringify(at("v2").rules["0031"].digest)} },`,
        `    "0044": { "title": "The reader shall poll presence.", "digest": ${JSON.stringify(at("v2").rules["0044"].digest)} },`,
        `    "1234": { "title": "The reader shall show a footer.", "digest": ${JSON.stringify(at("v2").rules["1234"].digest)} }`,
        "  }",
        "}",
        ""
      ].join("\n")
    );
  });

  it("gives the Rules of the ref asked for, and moves a digest only when the Rule's meaning moves", () => {
    const v1 = at("v1").rules;
    const v2 = at("v2").rules;
    expect(Object.keys(v2).sort()).toEqual(["0002", "0031", "0044", "1234"]);
    // moved file, CRLF, spacing and a comment: same digest
    expect(v2["0002"].digest).toBe(v1["0002"].digest);
    expect(v2["1234"].digest).toBe(v1["1234"].digest);
    // reworded Then: new digest
    expect(v2["0031"].digest).not.toBe(v1["0031"].digest);
    expect(v2["0031"].title).toBe(v1["0031"].title);
  });

  it("reads the ref, not the working tree", () => {
    write("tests/bdd/features/student/a.feature", feature([rule("0777", "Uncommitted.", "x")]));
    expect(Object.keys(at("v2").rules)).not.toContain("0777");
    git("checkout", "--", ".");
  });

  it("publishes an empty file for a ref with no Rules", () => {
    git("checkout", "-q", "--orphan", "empty-branch");
    git("rm", "-rfq", ".");
    write("README.md", "nothing here");
    commit("bare", "bare");
    expect(rulesJsonAtRef("bare", gitIn(dir))).toBe('{\n  "version": 1,\n  "rules": {}\n}\n');
    git("checkout", "-q", "main");
  });

  it("fails on a ref that does not exist", () => {
    expect(() => rulesJsonAtRef("no-such-ref", gitIn(dir))).toThrow();
  });

  it("is what a claim's `rule` is validated against", () => {
    const ids = new Set(Object.keys(at("v2").rules));
    const claim = (id: string) => `claims:\n  - artefact: dom\n    scope: "reader:*"\n    rule: "${id}"\n`;
    expect(validateClaimsText(claim("0044"), ids)).toEqual([]);
    expect(validateClaimsText(claim("0099"), ids)).toEqual([expect.stringContaining("rule 0099 is not defined")]);
    // a Rule that exists at one ref and not another resolves only at the first
    expect(validateClaimsText(claim("0044"), new Set(Object.keys(at("v1").rules)))).toEqual([expect.stringContaining("rule 0044 is not defined")]);
  });

  it("renders any map deterministically", () => {
    const rules = new Map([
      ["1234", { title: "b", digest: "y" }],
      ["0031", { title: "a", digest: "x" }]
    ]);
    expect(renderRulesJson(rules)).toBe(renderRulesJson(new Map([...rules].reverse())));
    expect(renderRulesJson(new Map())).toBe('{\n  "version": 1,\n  "rules": {}\n}\n');
  });

  it("reads its arguments", () => {
    expect(parseArgs([])).toEqual({ ref: "HEAD", out: undefined });
    expect(parseArgs(["--ref", "v1.2.3-rc.1", "--out", "out/rules.json"])).toEqual({ ref: "v1.2.3-rc.1", out: "out/rules.json" });
    expect(() => parseArgs(["--ref"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--out", "--ref"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown argument/);
  });
});

describe("release rules.json for this repository", () => {
  it("is valid at HEAD, and `pnpm release:rules --out` writes exactly that", () => {
    const text = rulesJsonAtRef("HEAD");
    const parsed = JSON.parse(text) as RulesJson;
    expect(parsed.version).toBe(1);
    const entries = Object.entries(parsed.rules);
    expect(entries.length).toBeGreaterThan(0);
    for (const [id, entry] of entries) {
      expect(id).toMatch(/^\d{4}$/);
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.digest).toMatch(/^[0-9a-f]{40}$/);
    }

    const dir = mkdtempSync(join(tmpdir(), "release-rules-cli-"));
    try {
      const out = join(dir, "nested", "rules.json");
      execFileSync(process.execPath, ["--import", "tsx", "scripts/release-rules.ts", "--ref", "HEAD", "--out", out], { cwd: REPO_ROOT, stdio: "pipe" });
      expect(existsSync(out)).toBe(true);
      expect(readFileSync(out, "utf8")).toBe(text);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // Spawns a tsx child process; under a full parallel run that alone can pass the 5s default.
  }, 30_000);
});
