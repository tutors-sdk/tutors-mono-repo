import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";
import { REPO_ROOT, readText } from "../../scripts/checks/lib/repo.ts";
import {
  COMMENT_AUTHOR,
  MARKER,
  MAX_COMMENT_CHARS,
  REPORT_ARTIFACT,
  WAIT_MINUTES,
  asReleaseReport,
  code,
  findReport,
  judge,
  matchRun,
  pickComment,
  renderComment,
  reportNamesCandidate,
  run,
  text,
  titleNames,
  type HarnessReport,
  type WorkflowRun
} from "../../scripts/release-report-comment.ts";

const ZW = String.fromCharCode(0x200b); // zero-width space, the guard after every @
const roots: string[] = [];
afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true });
});
function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), "release-report-comment-"));
  roots.push(dir);
  return dir;
}

const D = (n: string): string => `sha256:${n.repeat(64)}`;
const IMAGE = (app: string, tag: string): string => `quay.io/tutors-sdk/tutors-${app}:${tag}`;

function report(overrides: Partial<HarnessReport> = {}): HarnessReport {
  const apps = ["reader", "catalogue", "live", "time"];
  return {
    schemaVersion: 1,
    harness: { version: "1.3.0", contractVersion: "1.3.0" },
    mode: "release",
    ranAt: "2026-09-21T10:20:00.000Z",
    runs: 5,
    sides: {
      a: Object.fromEntries(apps.map((app) => [app, IMAGE(app, "16.2.2")])),
      b: Object.fromEntries(apps.map((app) => [app, IMAGE(app, "16.3.0-rc.1")]))
    },
    provenance: {
      a: { images: Object.fromEntries(apps.map((app, i) => [app, { digest: D(String(i + 1)), provenance: "pulled+verified" }])) },
      b: { images: Object.fromEntries(apps.map((app, i) => [app, { digest: D(String(i + 5)), provenance: "pulled+verified" }])) }
    },
    verdict: "fail",
    reasons: ["2 unclaimed differences", "1 stale claim"],
    compare: {
      hunks: [
        { id: "h1", artefact: "dom", scope: "reader:lab-step", summary: "reading time added", severity: "fail" },
        { id: "h2", artefact: "axe", scope: "reader:home", summary: "contrast", severity: "fail" },
        { id: "h3", artefact: "timing", scope: "reader:home", summary: "slower", severity: "info" }
      ],
      matches: [
        { hunk: { id: "h1" }, claim: { artefact: "dom", scope: "reader:*", reason: "Rule 0031" } },
        { hunk: { id: "h2" } },
        { hunk: { id: "h3" } }
      ],
      unclaimed: [
        { id: "h2", artefact: "axe", scope: "reader:home", summary: "contrast", severity: "fail" },
        { id: "h3", artefact: "timing", scope: "reader:home", summary: "slower", severity: "fail" }
      ],
      staleClaims: [{ artefact: "dom", scope: "x", reason: "old" }],
      broadUnapproved: []
    },
    ...overrides
  };
}

describe("release-report-comment: text is data", () => {
  it("defuses mentions, HTML, references, links and table syntax", () => {
    const hostile = 'hi @octocat and @tutors-sdk/maintainers <img src=x onerror=alert(1)> <!-- hidden --> see #123 [click](https://evil.example/x) a|b `code`';
    const out = text(hostile, 1000);
    expect(out).not.toMatch(new RegExp(`@(?!${ZW})`));
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    expect(out).not.toContain("<!--");
    expect(out).not.toMatch(/#\d/);
    expect(out).not.toContain("https://");
    expect(out).not.toMatch(/(^|[^\\])\]\(/); // an escaped bracket does not open a link
    expect(out).not.toMatch(/[^\\]\|/);
    expect(out).not.toContain("`");
    // still readable
    expect(out).toContain("octocat");
    expect(out).toContain("&lt;img");
  });

  it("is one line, without control characters, capped", () => {
    expect(text("a\nb\r\nc\u0000d\u001b[31m")).not.toMatch(/[\n\r]/);
    expect([...text("a\u0000b\u001bc")].every((ch) => (ch.codePointAt(0) ?? 0) >= 0x20)).toBe(true);
    expect(text("x".repeat(500), 50)).toHaveLength(50);
    expect(text("x".repeat(500), 50).endsWith(String.fromCharCode(0x2026))).toBe(true);
    expect(text(undefined)).toBe("");
    expect(code("a`b")).toBe("`a'b`");
    expect(code("")).toBe("-");
  });

  it("cannot forge the marker", () => {
    expect(text(`${MARKER} and more`, 200)).not.toContain(MARKER);
  });
});

describe("release-report-comment: the harness run", () => {
  const run = (id: number, title: string, created: string, event = "repository_dispatch"): WorkflowRun => ({ id, display_title: title, name: "Release harness", created_at: created, event });
  const dispatched = "2026-09-21T10:00:00Z";

  it("recognises a title that names the candidate as a whole tag", () => {
    expect(titleNames("release 16.3.0-rc.1", "16.3.0-rc.1")).toBe(true);
    expect(titleNames("release v16.3.0-rc.1 (retry)", "16.3.0-rc.1")).toBe(true);
    expect(titleNames("release 16.3.0-rc.10", "16.3.0-rc.1")).toBe(false);
    expect(titleNames("release 116.3.0-rc.1", "16.3.0-rc.1")).toBe(false);
    expect(titleNames("release 16.3.0-rc.1.", "16.3.0-rc.1")).toBe(true);
    expect(titleNames("release 16.3.0", "16.3.0-rc.1")).toBe(false);
    expect(titleNames("release 16.3.0-rc.1", "16.3.0")).toBe(false);
  });

  it("picks the run titled for the candidate, and the earliest one after the dispatch", () => {
    const runs = [
      run(9, "release 16.3.0-rc.1", "2026-09-21T09:00:00Z"), // an earlier dispatch of the same tag
      run(8, "release 16.3.0-rc.2", "2026-09-21T10:00:20Z"),
      run(7, "release 16.3.0-rc.1", "2026-09-21T10:00:40Z"),
      run(6, "release 16.3.0-rc.1", "2026-09-21T10:30:00Z")
    ];
    const match = matchRun(runs, "16.3.0-rc.1", dispatched);
    expect(match).toMatchObject({ status: "found", how: "run-name" });
    expect(match.run?.id).toBe(7);
  });

  it("allows a little clock skew, and no more", () => {
    expect(matchRun([run(1, "release 16.3.0-rc.1", "2026-09-21T09:59:00Z")], "16.3.0-rc.1", dispatched).status).toBe("found");
    expect(matchRun([run(1, "release 16.3.0-rc.1", "2026-09-21T09:50:00Z")], "16.3.0-rc.1", dispatched).status).toBe("none");
  });

  it("falls back to the one run that started in the window when the harness sets no run-name", () => {
    const named = run(5, "Merge pull request #12 from tutors-sdk/x", "2026-09-21T10:00:30Z");
    const match = matchRun([named, run(4, "release 16.3.0-rc.2", "2026-09-21T10:00:10Z")], "16.3.0-rc.1", dispatched);
    expect(match).toMatchObject({ status: "found", how: "time-window" });
    expect(match.run?.id).toBe(5);
  });

  it("guesses nothing when two runs could be it, or none started", () => {
    const two = [run(5, "commit A", "2026-09-21T10:00:30Z"), run(6, "commit B", "2026-09-21T10:01:00Z")];
    expect(matchRun(two, "16.3.0-rc.1", dispatched)).toMatchObject({ status: "ambiguous" });
    expect(matchRun(two, "16.3.0-rc.1", dispatched).detail).toContain("run-name: release");
    expect(matchRun([], "16.3.0-rc.1", dispatched, Date.parse(dispatched) + 60_000)).toMatchObject({ status: "none", detail: "the harness run has not started yet" });
    expect(matchRun([], "16.3.0-rc.1", dispatched, Date.parse(dispatched) + 3_600_000).detail).toMatch(/no run/);
    expect(matchRun([run(5, "commit", "2026-09-21T11:00:00Z")], "16.3.0-rc.1", dispatched).status).toBe("none"); // outside the window
    expect(matchRun([run(5, "commit", "2026-09-21T10:00:30Z", "workflow_dispatch")], "16.3.0-rc.1", dispatched).status).toBe("none");
    expect(matchRun([], "16.3.0-rc.1", "yesterday").status).toBe("none");
  });

  it("checks a report names the candidate as side b", () => {
    expect(reportNamesCandidate(report(), "16.3.0-rc.1")).toBe(true);
    expect(reportNamesCandidate(report(), "16.3.0-rc.2")).toBe(false);
    expect(reportNamesCandidate(report({ sides: { a: {}, b: { reader: `${IMAGE("reader", "16.3.0-rc.1")}@${D("a")}` } } }), "16.3.0-rc.1")).toBe(true);
    expect(reportNamesCandidate(report({ sides: { a: {}, b: { reader: IMAGE("reader", "16.3.0-rc.10") } } }), "16.3.0-rc.1")).toBe(false);
  });
});

describe("release-report-comment: the verdict", () => {
  it("maps the report to what the harness's exit code says", () => {
    expect(judge(report({ verdict: "pass" }))).toEqual({ outcome: "pass", exitCode: 0, label: "PASS" });
    expect(judge(report({ verdict: "warn" }))).toEqual({ outcome: "warn", exitCode: 0, label: "WARN (advisory)" });
    expect(judge(report({ verdict: "fail" }))).toEqual({ outcome: "fail", exitCode: 1, label: "FAIL" });
    expect(judge(report({ verdict: "fail", override: { applied: true, by: "someone", reason: "r".repeat(20), verdict: "fail" } })).exitCode).toBe(0);
    expect(judge(report({ verdict: "fail", override: { applied: false } })).outcome).toBe("fail");
    expect(judge(undefined)).toEqual({ outcome: "could-not-judge", exitCode: 2, label: "COULD NOT JUDGE" });
    expect(judge(undefined, true)).toEqual({ outcome: "pending", exitCode: undefined, label: "PENDING" });
  });

  it("accepts only a release-mode report of a schema it knows", () => {
    expect(asReleaseReport(report())).toBeDefined();
    expect(asReleaseReport(report({ mode: "migration" }))).toBeUndefined();
    expect(asReleaseReport(report({ schemaVersion: 2 }))).toBeUndefined();
    expect(asReleaseReport(report({ verdict: "maybe" }))).toBeUndefined();
    expect(asReleaseReport(null)).toBeUndefined();
    expect(asReleaseReport("fail")).toBeUndefined();
  });

  it("finds the release report in an unpacked artifact, and only that one", () => {
    const dir = tmp();
    mkdirSync(join(dir, "out", "2026-09-21T10-00-00-release"), { recursive: true });
    mkdirSync(join(dir, "out", "2026-09-21T10-00-00-migration"), { recursive: true });
    writeFileSync(join(dir, "out", "2026-09-21T10-00-00-migration", "report.json"), JSON.stringify(report({ mode: "migration", verdict: "pass" })));
    expect(findReport(dir)).toBeUndefined();
    writeFileSync(join(dir, "out", "2026-09-21T10-00-00-release", "report.json"), JSON.stringify(report({ verdict: "warn" })));
    writeFileSync(join(dir, "out", "2026-09-21T10-00-00-release", "junk.json"), "{");
    expect(findReport(dir)?.verdict).toBe("warn");
    expect(findReport(join(dir, "missing"))).toBeUndefined();
  });
});

describe("release-report-comment: the comment", () => {
  const base = { candidate: "16.3.0-rc.1", production: "16.2.2", runId: 4242, artifactId: 77, now: new Date("2026-09-21T10:30:00Z") };

  it("starts with the marker and states the verdict, exit code, harness, images, digests, counts and links", () => {
    const body = renderComment({ ...base, report: report(), jobs: [{ name: "Release mode (A/B, claims, k6)", conclusion: "failure" }, { name: "Migration rehearsal", conclusion: "success" }] });
    expect(body.startsWith(`${MARKER}\n`)).toBe(true);
    expect(body).toContain("## Release harness: FAIL, `v16.3.0-rc.1`");
    expect(body).toContain("| Exit code | 1 ");
    expect(body).toContain("`1.3.0` (contract `1.3.0`)");
    expect(body).toContain("`quay.io/tutors-sdk/tutors-time:16.2.2`");
    expect(body).toContain(`\`${D("4")}\``); // production time digest
    expect(body).toContain(`\`${D("8")}\``); // candidate time digest
    expect(body).toContain("| 3 | 1 | 2 | 1 | 0 |"); // differences, claimed, unclaimed, stale, broad
    expect(body).toContain("https://github.com/tutors-sdk/tutors-release-harness/actions/runs/4242");
    expect(body).toContain("https://github.com/tutors-sdk/tutors-release-harness/actions/runs/4242/artifacts/77");
    expect(body).toContain("Release mode: failure, Migration rehearsal: success");
    expect(body).toContain("2 unclaimed differences");
  });

  it("lists the first N unclaimed hunks and says how many more", () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ id: `h${i}`, artefact: "dom", scope: `reader:page-${i}`, summary: `change ${i}`, severity: "fail" }));
    const body = renderComment({ ...base, report: report({ compare: { hunks: many, matches: [], unclaimed: many, staleClaims: [], broadUnapproved: [] } }) }, { maxHunks: 10 });
    expect(body).toContain("### Unclaimed differences (10 of 25)");
    expect(body).toContain("reader:page-9");
    expect(body).not.toContain("reader:page-10`");
    expect(body).toContain("... and 15 more in the report");
  });

  it("renders WARN as advisory, exit 0", () => {
    const body = renderComment({ ...base, report: report({ verdict: "warn", reasons: ["noise status is 9 days old"] }) });
    expect(body).toContain("## Release harness: WARN (advisory)");
    expect(body).toContain("| Exit code | 0 ");
    expect(body).toMatch(/Advisory, exit code 0: nothing is blocked/);
    expect(body).toContain("noise status is 9 days old");
  });

  it("renders PASS with nothing to list", () => {
    const body = renderComment({ ...base, report: report({ verdict: "pass", compare: { hunks: [], matches: [], unclaimed: [], staleClaims: [], broadUnapproved: [] } }) });
    expect(body).toContain("## Release harness: PASS");
    expect(body).not.toContain("### Unclaimed differences");
    expect(body).toContain("| 0 | 0 | 0 | 0 | 0 |");
  });

  it("renders exit 2 as could not judge, and never as a pass", () => {
    const body = renderComment({ ...base, report: undefined, artifactId: undefined, jobs: [{ name: "Release mode (A/B, claims, k6)", conclusion: "failure" }], runConclusion: "failure" });
    expect(body).toContain("## Release harness: COULD NOT JUDGE");
    expect(body).toContain("| Exit code | 2 ");
    expect(body).toMatch(/reached no verdict[\s\S]*not\*\* a pass/);
    expect(body).not.toContain("PASS");
    expect(body).toContain("not found (release-report)");
    expect(body).not.toContain("### Images judged");
  });

  it("renders a run that had not finished, and an override", () => {
    const pending = renderComment({ ...base, pending: true });
    expect(pending).toContain("## Release harness: PENDING");
    expect(pending).toContain("not finished");
    const overridden = renderComment({ ...base, report: report({ override: { applied: true, by: "leigh", reason: "Known and accepted for the demo release", verdict: "fail" } }) });
    expect(overridden).toContain("FAIL (overridden)");
    expect(overridden).toContain("Overridden by `leigh`: Known and accepted");
    expect(overridden).toContain("| Exit code | 0 ");
  });

  it("says when the run was matched by time alone", () => {
    expect(renderComment({ ...base, report: report(), how: "time-window" })).toContain("matched by start time");
    expect(renderComment({ ...base, report: report(), how: "run-name" })).not.toContain("matched by start time");
  });

  it("treats a hostile report as data", () => {
    const evil = "@everyone <script>alert(1)</script> #1 [x](javascript:alert(1)) https://evil.example";
    const body = renderComment({
      ...base,
      report: report({
        harness: { version: evil, contractVersion: evil },
        reasons: [evil],
        override: { applied: true, by: evil, reason: evil, verdict: "fail" },
        sides: { a: { reader: evil }, b: { reader: evil } },
        compare: { hunks: [], matches: [], unclaimed: [{ artefact: evil, scope: evil, summary: evil, severity: "fail" }], staleClaims: [], broadUnapproved: [] }
      }),
      jobs: [{ name: `Release ${evil}`, conclusion: evil }]
    });
    const bodyWithoutOurs = body.replace(/https:\/\/github\.com\/tutors-sdk\/tutors-release-harness\/actions\/runs\/4242(\/artifacts\/77)?/g, "");
    expect(bodyWithoutOurs).not.toMatch(new RegExp(`@(?!${ZW})`));
    expect(bodyWithoutOurs).not.toContain("<script");
    expect(bodyWithoutOurs).not.toContain("https://");
    expect(bodyWithoutOurs).not.toMatch(/(^|[^\\])\]\(javascript/);
    expect(bodyWithoutOurs).not.toMatch(/#\d/);
    expect(body.split(MARKER)).toHaveLength(2); // the marker only at the top
  });

  it("stays under GitHub's limit however large the report is", () => {
    const huge = Array.from({ length: 2000 }, (_, i) => ({ id: `h${i}`, artefact: "dom", scope: "s".repeat(500), summary: "m".repeat(5000), severity: "fail" }));
    const body = renderComment({ ...base, report: report({ compare: { hunks: huge, matches: [], unclaimed: huge, staleClaims: [], broadUnapproved: [] } }) }, { maxHunks: 2000 });
    expect(body.length).toBeLessThanOrEqual(MAX_COMMENT_CHARS);
    expect(body.startsWith(MARKER)).toBe(true);
    expect(body).toContain("cut at");
  });
});

describe("release-report-comment: which comment to update", () => {
  const bot = { login: COMMENT_AUTHOR, type: "Bot" };
  it("takes the oldest comment of the workflow's own token that starts with the marker", () => {
    expect(
      pickComment([
        { id: 30, body: `${MARKER}\nnewer`, user: bot },
        { id: 10, body: "an unrelated comment", user: bot },
        { id: 20, body: `\n${MARKER}\nolder`, user: bot }
      ])
    ).toBe(20);
  });

  it("never edits someone else's comment that copies the marker, or one that only quotes it", () => {
    expect(pickComment([{ id: 1, body: `${MARKER}\nforged`, user: { login: "mallory", type: "User" } }])).toBeUndefined();
    expect(pickComment([{ id: 2, body: `> ${MARKER}`, user: bot }, { id: 3, body: `text ${MARKER}`, user: bot }])).toBeUndefined();
    expect(pickComment([{ id: 4, body: null, user: null }])).toBeUndefined();
    expect(pickComment([])).toBeUndefined();
  });
});

describe("release-report-comment: command line", () => {
  it("runs find-run, render and pick-comment over the files gh api writes", () => {
    const dir = tmp();
    const write = (name: string, value: unknown): string => {
      const file = join(dir, name);
      writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
      return file;
    };
    const runs = write("runs.json", { workflow_runs: [{ id: 42, display_title: "release 16.3.0-rc.1", created_at: "2026-09-21T10:00:30Z", event: "repository_dispatch", status: "queued" }] });
    expect(JSON.parse(run(["find-run", "--runs", runs, "--candidate", "16.3.0-rc.1", "--dispatched-at", "2026-09-21T10:00:00Z"]))).toMatchObject({ status: "found", how: "run-name", id: 42 });

    mkdirSync(join(dir, "art", "x-release"), { recursive: true });
    writeFileSync(join(dir, "art", "x-release", "report.json"), JSON.stringify(report()));
    const out = join(dir, "body.md");
    const verdict = JSON.parse(
      run([
        "render", "--candidate", "16.3.0-rc.1", "--production", "16.2.2", "--run", write("run.json", { id: 42, conclusion: "failure" }), "--report-dir", join(dir, "art"),
        "--jobs", write("jobs.json", { jobs: [{ name: "Migration rehearsal", conclusion: "success" }] }),
        "--artifacts", write("artifacts.json", { artifacts: [{ id: 9, name: REPORT_ARTIFACT, expired: false }] }), "--state", "done", "--how", "run-name", "--out", out
      ])
    );
    expect(verdict).toEqual({ outcome: "fail", label: "FAIL", exitCode: 1 });
    expect(readText(out)).toContain("/artifacts/9");

    // paginated comments arrive as one JSON document per line
    const comments = write("comments.json", `${JSON.stringify({ id: 5, body: "hi", user: { login: "a", type: "User" } })}\n${JSON.stringify({ id: 6, body: `${MARKER}\nx`, user: { login: COMMENT_AUTHOR, type: "Bot" } })}\n`);
    expect(run(["pick-comment", "--comments", comments]).trim()).toBe("6");
    expect(run(["pick-comment", "--comments", write("none.json", "")])).toBe("");
  });

  it("refuses a run matched by time whose report judged another candidate, and bad input", () => {
    const dir = tmp();
    mkdirSync(join(dir, "art"), { recursive: true });
    writeFileSync(join(dir, "art", "report.json"), JSON.stringify(report()));
    writeFileSync(join(dir, "run.json"), JSON.stringify({ id: 1 }));
    const args = ["render", "--candidate", "16.3.0-rc.9", "--run", join(dir, "run.json"), "--report-dir", join(dir, "art"), "--how", "time-window", "--out", join(dir, "b.md")];
    expect(() => run(args)).toThrow(/another candidate/);
    expect(() => run(["render", "--candidate", "latest", "--run", join(dir, "run.json"), "--out", join(dir, "b.md")])).toThrow(/must look like/);
    expect(() => run(["find-run"])).toThrow(/required/);
    expect(() => run(["frobnicate"])).toThrow(/usage/);
  });
});

/** The workflow's shape is the security argument: hold it in place. */
describe("release-report-comment: workflow structure", () => {
  type Job = { permissions?: Record<string, string>; "continue-on-error"?: boolean; "timeout-minutes"?: number; needs?: string | string[]; if?: string; env?: Record<string, string>; steps: Array<{ name?: string; run?: string; env?: Record<string, string>; if?: string; id?: string }> };
  const file = ".github/workflows/release-harness-report.yml";
  const source = readText(join(REPO_ROOT, file));
  const doc = yaml.load(source) as { on: Record<string, unknown>; permissions: unknown; env: Record<string, string>; concurrency: { group: string; "cancel-in-progress": boolean }; jobs: Record<string, Job> };
  const job = doc.jobs.report;
  const steps = job.steps;

  it("is started by hand or by release-dispatch.yml only", () => {
    expect(Object.keys(doc.on)).toEqual(["workflow_dispatch"]);
    expect(doc.permissions).toEqual({});
    expect(Object.keys(doc.jobs)).toEqual(["report"]);
    expect(doc.concurrency["cancel-in-progress"]).toBe(true);
  });

  it("holds least privilege: pull-requests write and contents read on this one job, nothing else", () => {
    expect(job.permissions).toEqual({ contents: "read", "pull-requests": "write" });
    expect(source).not.toMatch(/^\s+(actions|checks|statuses|deployments|issues|packages|id-token|contents):\s*write/m);
  });

  it("never puts an expression inside a run: block", () => {
    for (const step of steps) if (step.run) expect(step.run, step.name).not.toContain("${{");
    for (const step of steps) if (step.run) expect(step.run, step.name).not.toMatch(/set -x|xtrace|echo "?\$GH_TOKEN|printenv|\benv\b\s*\|/);
  });

  it("gives the harness token to the one step that reads the harness, and nothing else", () => {
    const holders = steps.filter((s) => JSON.stringify(s.env ?? {}).includes("secrets.HARNESS_TOKEN")).map((s) => s.name);
    expect(holders).toEqual(["Find the harness run and wait for it"]);
    expect(source.match(/secrets\./g)).toHaveLength(1);
    const commenting = steps.find((s) => s.name === "Post or update the comment");
    expect(commenting?.env?.GH_TOKEN).toBe("${{ github.token }}");
  });

  it("takes its inputs through env, and validates them before use", () => {
    expect(job.env).toMatchObject({ CANDIDATE: "${{ inputs.candidate }}", BRANCH: "${{ inputs.branch }}", SHA: "${{ inputs.sha }}", DISPATCHED_AT: "${{ inputs.dispatched_at }}" });
    expect(steps[0].name).toBe("Check the inputs");
    expect(steps[0].run).toContain("release/[0-9A-Za-z._-]+");
  });

  it("waits the same time the script says, polls with backoff and gives up", () => {
    expect(doc.env.WAIT_MINUTES).toBe(String(WAIT_MINUTES));
    expect(WAIT_MINUTES).toBe(45);
    expect(job["timeout-minutes"]).toBeGreaterThan(WAIT_MINUTES + 10);
    const wait = steps.find((s) => s.id === "wait")?.run ?? "";
    expect(wait).toContain('delay=$(( delay * 3 / 2 ))');
    expect(wait).toContain("state timeout");
    expect(wait).toContain("gh run download");
    expect(wait).toContain(`--name ${REPORT_ARTIFACT}`);
  });

  it("finds the pull request among this repository's own branches and posts nothing when there is none", () => {
    const post = steps.find((s) => s.name === "Post or update the comment")?.run ?? "";
    expect(post).toContain("headRepositoryOwner");
    expect(post).toContain("nothing was posted");
    expect(post.indexOf("pr list")).toBeLessThan(post.indexOf("release:report-comment render"));
    expect(post).toContain("--method PATCH");
    expect(post).toContain("--method POST");
    expect(post).toContain("pick-comment");
  });

  it("names the artifact and the marker the script and the harness contract use", () => {
    expect(source).toContain("release-report");
    expect(MARKER).toBe("<!-- tutors-release-harness-report -->");
    expect(readText(join(REPO_ROOT, "scripts/release-report-comment.ts"))).toContain('export const REPORT_ARTIFACT = "release-report"');
  });

  it("has a package.json entry for the script", () => {
    const pkg = JSON.parse(readText(join(REPO_ROOT, "package.json"))) as { scripts: Record<string, string> };
    expect(pkg.scripts["release:report-comment"]).toBe("tsx scripts/release-report-comment.ts");
    expect(source).toContain("pnpm --silent release:report-comment find-run");
  });
});

describe("release-report-comment: the hand-off from release-dispatch.yml", () => {
  const source = readText(join(REPO_ROOT, ".github/workflows/release-dispatch.yml"));
  const doc = yaml.load(source) as { jobs: Record<string, { needs?: string | string[]; permissions?: Record<string, string>; "continue-on-error"?: boolean; steps: Array<{ run?: string }> }> };
  const handoff = doc.jobs.report;

  it("starts the report workflow from its own job, after the dispatch, best-effort", () => {
    expect(handoff.needs).toEqual(["candidate", "dispatch"]);
    expect(handoff["continue-on-error"]).toBe(true);
    expect(handoff.permissions).toEqual({ "actions": "write" });
    const run = handoff.steps.map((s) => s.run ?? "").join("\n");
    expect(run).toContain("gh workflow run release-harness-report.yml");
    expect(run).toContain('--ref "$DEFAULT_BRANCH"'); // the code on main, not the release branch's copy
    for (const input of ["candidate", "production", "branch", "sha", "dispatched_at"]) expect(run).toContain(`-f "${input}=`);
    expect(run).toContain("exit 0"); // a failure to hand over is a warning
  });

  it("passes only inputs the report workflow declares", () => {
    const report = yaml.load(readText(join(REPO_ROOT, ".github/workflows/release-harness-report.yml"))) as { on: { workflow_dispatch: { inputs: Record<string, unknown> } } };
    const run = handoff.steps.map((s) => s.run ?? "").join("\n");
    const passed = [...run.matchAll(/-f "(\w+)=/g)].map((m) => m[1]).sort();
    expect(passed).toEqual(Object.keys(report.on.workflow_dispatch.inputs).sort());
  });

  it("does not put the wait in the workflow whose concurrency group must stay free", () => {
    expect(Object.keys(doc.jobs)).not.toContain("wait");
    expect(source).not.toContain("gh run download");
    expect(source).toContain("dispatched_at=$(date -u");
    // dispatch must not depend on the report job, and no job may need it
    for (const [name, other] of Object.entries(doc.jobs)) if (name !== "report") expect([other.needs ?? []].flat()).not.toContain("report");
  });
});
