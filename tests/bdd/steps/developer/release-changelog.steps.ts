import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import yaml from "js-yaml";
import { afterAll, expect, vi } from "vitest";
import { buildChangelog, renderEntry, renderMarkdown, type Entry, type ReleaseChangelog } from "../../../../scripts/release-changelog.ts";
import { rulesJsonAtRef, type RulesJson } from "../../../../scripts/release-rules.ts";
import { gitIn } from "../../../../scripts/checks/lib/rules-index.ts";
import { REPO_ROOT, readText } from "../../../../scripts/checks/lib/repo.ts";

// Building the history shells out to git; under a full parallel run that alone can pass the 5s default.
vi.setConfig({ testTimeout: 30_000 });

const feature = await loadFeature("tests/bdd/features/developer/release-changelog.feature");

const featureWith = (rules: string[]) => `Feature: F\n\n${rules.join("\n")}`;
const rule = (id: string, title: string, then: string) =>
  `  @rule-${id} @ears-ubiquitous\n  Rule: ${title}\n\n    Scenario: proof ${id}\n      When something happens\n      Then ${then}\n`;

/** The history the feature's description tells, in a throwaway repository. Built once. */
function exampleHistory(): string {
  const dir = mkdtempSync(join(tmpdir(), "release-changelog-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  const write = (path: string, text: string) => {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  };
  const commitAll = (message: string) => {
    git("add", "-A");
    git("commit", "-q", "-m", message);
  };
  const merge = (branch: string, pr: number, title: string | undefined, change: () => void) => {
    git("checkout", "-q", "-b", branch);
    change();
    commitAll(`work on ${branch}`);
    git("checkout", "-q", "main");
    const message = [`Merge pull request #${pr} from tutors-sdk/${branch}`, ...(title ? [title] : [])];
    git("merge", "-q", "--no-ff", ...message.flatMap((m) => ["-m", m]), branch);
  };

  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  git("config", "commit.gpgsign", "false");
  write("tests/bdd/features/student/a.feature", featureWith([rule("0001", "The reader shall show a footer.", "the footer is shown")]));
  write("CHANGELOG.md", "# Changelog\n");
  commitAll("v1");
  git("tag", "v1");

  merge("feat/quiz-wall", 10, "feat(reader): quiz wall (dom, screenshot)", () => {
    write("apps/reader/src/quiz-wall.ts", "export {};\n");
    write(
      "tests/bdd/features/student/a.feature",
      featureWith([rule("0001", "The reader shall show a footer.", "the footer is shown"), rule("0002", "The reader shall list quizzes on a wall.", "the quizzes are listed")])
    );
  });
  merge("fix/presence-poll-interval", 11, undefined, () => {
    write("packages/jsr/model/src/presence.ts", "export {};\n");
    write("packages/jsr/model/src/presence-poll.ts", "export {};\n");
    write("tests/presence.test.ts", "export {};\n");
  });
  write("apps/live/src/menus.ts", "export {};\n");
  write(
    "tests/bdd/features/student/a.feature",
    featureWith([rule("0001", "The reader shall show a footer.", "the footer is shown in bold"), rule("0002", "The reader shall list quizzes on a wall.", "the quizzes are listed")])
  );
  commitAll("Tidy the live menus");
  merge("release/1.0.1", 12, "Release 1.0.1", () => write("apps/reader/src/version.ts", "export const version = '1.0.1';\n"));
  write("package.json", "{}\n");
  commitAll("chore: bump eslint (#13)");
  return dir;
}

describeFeature(feature, ({ Rule }) => {
  let dir: string | undefined;
  let from: string;
  let to: string;
  let log: ReleaseChangelog;
  let markdown: string;
  let rulesJson: RulesJson;
  let current: Entry;

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const givenHistory = (_ctx: unknown, a: string, b: string) => {
    dir ??= exampleHistory();
    from = a;
    to = b;
  };
  const generate = () => {
    log = buildChangelog(from, to, gitIn(dir));
    markdown = renderMarkdown(log);
  };
  const entryFor = (pr: number) => {
    const found = log.entries.filter((entry) => entry.pr === pr);
    expect(found, `pull request ${pr}`).toHaveLength(1);
    return found[0]!;
  };

  Rule(
    "When a release author generates the changelog between two refs, tutors shall list every pull request merged on the first-parent history between them once, leaving out merges of a release branch.",
    ({ RuleScenario }) => {
      RuleScenario("Every pull request since the tag is listed once", ({ Given, When, Then, And }) => {
        Given("the example history from {string} to {string}", givenHistory);
        When("the changelog is generated", generate);
        Then("it shall list pull requests {int}, {int} and {int} once each", (_ctx, a: number, b: number, c: number) => {
          for (const pr of [a, b, c]) entryFor(pr);
          expect(log.entries.filter((entry) => entry.pr !== null).map((entry) => entry.pr)).toEqual([a, b, c]);
        });
        And("it shall not list pull request {int}", (_ctx, pr: number) => {
          expect(log.entries.some((entry) => entry.pr === pr)).toBe(false);
          expect(markdown).not.toContain(`PR #${pr}`);
        });
      });
    }
  );

  Rule(
    "Tutors shall list each changelog entry under the product section with the most changed files and under the heading of its Conventional Commits type, keeping the artefact hints of its title.",
    ({ RuleScenario }) => {
      RuleScenario("Entries are grouped by product section and change type", ({ Given, When, Then, And }) => {
        const listedAs = (pr: number, section: string, kind: string, title: string) => {
          const entry = entryFor(pr);
          expect(entry.sections[0]).toBe(section);
          expect(entry.kind).toBe(kind);
          expect(entry.title).toBe(title);
          // In the Markdown, the entry sits under its section's heading and then its kind's.
          const at = markdown.indexOf(renderEntry(entry));
          expect(markdown.lastIndexOf(`## ${section}`, at)).toBeGreaterThan(-1);
          expect(markdown.lastIndexOf(`#### ${kind}`, at)).toBeGreaterThan(markdown.lastIndexOf(`## ${section}`, at));
          return entry;
        };
        Given("the example history from {string} to {string}", givenHistory);
        When("the changelog is generated", generate);
        Then("pull request {int} shall be listed under {string} and {string} as {string} with hints {string}", (_ctx, pr: number, section: string, kind: string, title: string, hints: string) => {
          expect(listedAs(pr, section, kind, title).hints.join(", ")).toBe(hints);
        });
        And("pull request {int} shall be listed under {string} and {string} as {string}", (_ctx, pr: number, section: string, kind: string, title: string) => {
          listedAs(pr, section, kind, title);
        });
        And("the squash-merged pull request {int} shall be listed under {string} and {string} as {string}", (_ctx, pr: number, section: string, kind: string, title: string) => {
          listedAs(pr, section, kind, title);
        });
      });
    }
  );

  Rule(
    "When a pull request adds, changes or removes an EARS Rule, tutors shall name the Rule id on the pull request's changelog entry and name the pull request against the Rule in the release's Rules table.",
    ({ RuleScenario }) => {
      RuleScenario("A Rule and its pull request name each other", ({ Given, When, Then, And }) => {
        Given("the example history from {string} to {string}", givenHistory);
        When("the changelog is generated", generate);
        Then("the entry for pull request {int} shall name Rule {string}", (_ctx, pr: number, id: string) => {
          expect(entryFor(pr).rules.added.map((r) => r.id)).toEqual([id]);
          expect(renderEntry(entryFor(pr))).toContain(`Rule ${id}`);
        });
        And("the release's Rules table shall list Rule {string} as {string} by pull request {int}", (_ctx, id: string, change: string, pr: number) => {
          expect(log.rules[id]).toMatchObject({ change, prs: [pr] });
        });
        And("the Markdown shall contain {string}", (_ctx, text: string) => {
          expect(markdown).toContain(text);
        });
      });
    }
  );

  Rule(
    "If a commit on the first-parent history did not come from a pull request, then tutors shall list it in the changelog with its commit hash and mark it as not from a pull request.",
    ({ RuleScenario }) => {
      RuleScenario("A commit straight to main is listed and marked", ({ Given, When, Then, And }) => {
        Given("the example history from {string} to {string}", givenHistory);
        When("the changelog is generated", generate);
        Then("the commit {string} shall be listed as not from a pull request", (_ctx, title: string) => {
          current = log.entries.find((entry) => entry.title === title)!;
          expect(current?.pr).toBeNull();
          expect(markdown).toContain(`- ${title} (${current.sha}, not from a pull request)`);
        });
        And("its entry shall name Rule {string}", (_ctx, id: string) => {
          expect(current.rules.changed.map((r) => r.id)).toEqual([id]);
        });
      });
    }
  );

  Rule(
    "When rules.json is written with a since ref, tutors shall give each Rule added or changed after that ref the pull requests that touched it.",
    ({ RuleScenario }) => {
      RuleScenario("rules.json names the pull requests behind a Rule", ({ Given, When, Then, And }) => {
        Given("the example history from {string} to {string}", givenHistory);
        When("rules.json is written for {string} since {string}", (_ctx, ref: string, since: string) => {
          rulesJson = JSON.parse(rulesJsonAtRef(ref, gitIn(dir), since)) as RulesJson;
        });
        Then("Rule {string} shall carry pull requests {string}", (_ctx, id: string, prs: string) => {
          expect(rulesJson.rules[id]?.prs).toEqual(prs.split(",").map(Number));
        });
        And("Rule {string} shall carry no pull requests", (_ctx, id: string) => {
          expect(rulesJson.rules[id]).toBeDefined();
          expect(rulesJson.rules[id]!.prs).toBeUndefined();
        });
      });
    }
  );

  Rule(
    "When a release candidate is tagged, tutors shall publish the candidate's generated changelog as the notes and assets of the candidate's prerelease.",
    ({ RuleScenario }) => {
      RuleScenario("The dispatch workflow publishes the changelog with the Rules", ({ Given, Then, And }) => {
        type Step = { name?: string; id?: string; uses?: string; with?: Record<string, unknown>; run?: string };
        let job: { steps: Step[]; env?: Record<string, string> };
        const publish = () => job.steps.find((step) => step.id === "publish")!.run!;
        Given("the release candidate dispatch workflow", () => {
          const workflow = yaml.load(readText(resolve(REPO_ROOT, ".github/workflows/release-dispatch.yml"))) as { jobs: Record<string, typeof job> };
          job = workflow.jobs.rules!;
        });
        Then("its rules job shall check out the full history", () => {
          const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
          expect(checkout?.with?.["fetch-depth"]).toBe(0);
        });
        And("its publish step shall generate the changelog from the production ref to the candidate", () => {
          expect(publish()).toContain('release:changelog --from "$from" --to "$GITHUB_SHA" --out changelog.md --json changelog.json');
        });
        And("its publish step shall upload {string} and {string}", (_ctx, a: string, b: string) => {
          const upload = publish().split("\n").find((line) => line.includes("gh release upload"));
          expect(upload).toContain(a);
          expect(upload).toContain(b);
          expect(publish()).toContain("--notes-file notes.md");
        });
        And("its publish step shall write rules.json with pull requests since the production ref", () => {
          expect(job.env?.PRODUCTION_REF).toBe("${{ needs.candidate.outputs.migrations_a }}");
          expect(publish()).toMatch(/release:rules --ref "\$GITHUB_SHA" --since "\$from"/);
        });
      });
    }
  );
});
