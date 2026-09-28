import { describe, expect, it } from "vitest";
import { curatedPrs, tableCell, parseArgs, parseTitle, pullRequestOf, ruleRanges, sectionOf, sectionsOf, titleFromBranch } from "../../scripts/release-changelog.ts";

describe("release changelog", () => {
  it("reads a pull request from a merge commit, a squash commit or neither", () => {
    expect(pullRequestOf({ sha: "a", subject: "Merge pull request #313 from tutors-sdk/codex/paper-ui-redesign", body: "\nfeat(ui): rebuild Tutors\n" })).toEqual({ pr: 313, title: "feat(ui): rebuild Tutors", release: false });
    expect(pullRequestOf({ sha: "a", subject: "Merge pull request #317 from tutors-sdk/fix/enable-rls-public-tables", body: "" })).toEqual({ pr: 317, title: "fix: enable rls public tables", release: false });
    expect(pullRequestOf({ sha: "a", subject: "Merge pull request #264 from tutors-sdk/release/16.2.2", body: "Release 16.2.2" }).release).toBe(true);
    expect(pullRequestOf({ sha: "a", subject: "fix(reader): nav contrast (axe, dom) (#301)", body: "" })).toEqual({ pr: 301, title: "fix(reader): nav contrast (axe, dom)", release: false });
    expect(pullRequestOf({ sha: "a", subject: "Create images.yml", body: "" })).toEqual({ pr: null, title: "Create images.yml", release: false });
  });

  it("titles a merge with no description from its branch", () => {
    expect(titleFromBranch("tutors-sdk/feature/grafana-observability")).toBe("feat: grafana observability");
    expect(titleFromBranch("tutors-sdk/codex/course-shell-mobile-header")).toBe("course shell mobile header");
    expect(titleFromBranch("someone/quick_fix")).toBe("quick fix");
  });

  it("reads the heading and the artefact hints from a Conventional Commits title", () => {
    expect(parseTitle("fix(reader): nav contrast raised (axe, dom)")).toEqual({ kind: "Fixes", hints: ["axe", "dom"], title: "Nav contrast raised" });
    expect(parseTitle("feat!: drop the legacy auth flow")).toMatchObject({ kind: "Breaking Changes" });
    expect(parseTitle("refactor: tidy", "BREAKING CHANGE: the route moved")).toMatchObject({ kind: "Breaking Changes" });
    expect(parseTitle("perf: split the bundle")).toMatchObject({ kind: "Fixes" });
    // A parenthesis that is not all artefact names stays in the title.
    expect(parseTitle("feat: stable log shape (M18, M19)")).toEqual({ kind: "Features", hints: [], title: "Stable log shape (M18, M19)" });
  });

  it("files a pull request under the product section with the most changed files", () => {
    expect(sectionOf("packages/svelte/course/src/x.ts")).toBe("Reader");
    expect(sectionOf(".github/workflows/image-build.yml")).toBe("Infrastructure");
    expect(sectionOf(".github/workflows/ci.yml")).toBe("Development");
    expect(sectionsOf(["apps/live/a.ts", "apps/time/a.ts", "apps/time/b.ts", "tests/a.ts", "tests/b.ts", "tests/c.ts"])).toEqual(["Time", "Live", "Development"]);
    expect(sectionsOf(["apps/live/a.ts", "apps/reader/a.ts"])).toEqual(["Reader", "Live"]);
    expect(sectionsOf(["guides/a.md"])).toEqual(["Development"]);
    expect(sectionsOf([])).toEqual(["Development"]);
  });

  it("writes runs of three or more Rule ids as a range", () => {
    expect(ruleRanges(["0019", "0020", "0021", "0031", "0059", "0060"])).toBe("0019-0021, 0031, 0059, 0060");
    expect(ruleRanges([])).toBe("");
  });

  it("finds the pull requests CHANGELOG.md already names", () => {
    expect([...curatedPrs("- Card summaries (PR #263)\n- Fixed scroll (#1092)\n- Issue 12")].sort()).toEqual([1092, 263]);
  });

  it("escapes a backslash and a pipe in a table cell", () => {
    expect(tableCell("a | b")).toBe("a \\| b");
    expect(tableCell("path\\|x")).toBe("path\\\\\\|x");
  });

  it("parses its arguments", () => {
    expect(parseArgs(["--from", "v16.2.2", "--to", "main"])).toEqual({ from: "v16.2.2", to: "main" });
    expect(parseArgs(["--from", "a", "--to", "b", "--out", "c.md", "--json", "c.json"])).toEqual({ from: "a", to: "b", out: "c.md", json: "c.json" });
    expect(() => parseArgs(["--from", "a"])).toThrow(/usage/);
    expect(() => parseArgs(["--from", "--to"])).toThrow(/needs a value/);
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown argument/);
  });
});
