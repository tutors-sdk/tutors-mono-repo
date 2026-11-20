/**
 * Validate corpus (Rules 0758-0760): `tutors validate` on real lecturers' courses, pinned by commit.
 *
 *   pnpm check:validate-corpus                    # compare every corpus course with the baseline
 *   pnpm check:validate-corpus --update           # record what validate reports now as the baseline
 *   pnpm check:validate-corpus --corpus reference-course,python
 *
 * The rule fixtures (tests/fixtures/validate) prove each rule on a course built to break it. This proves the
 * rules on courses nobody built for them: for every course in tests/validate-corpus/corpus.yaml it
 *   1. compares the findings with tests/validate-corpus/baseline.json, so a pull request that changes what a
 *      lecturer is told about a real course shows the change in its diff; a new error is called out, because
 *      since Rule 0744 the standard netlify.toml runs tutors validate and an error stops the deploy;
 *   2. checks V002 and V018 name exactly the folders the generator leaves out of that course;
 *   3. runs --fix twice on a copy and checks it settles (lib/validate-corpus.ts fixSettles).
 * Every run goes through runValidate, the `tutors validate` command Netlify runs (--format json, and --fix), so
 * the check also holds its argument parsing, its exit status and its --fix orchestration, not only the rules.
 *
 * Courses are big (slide decks, videos), so each is fetched as a partial clone that skips blobs of 256 KB
 * and over, and then the skipped text and images are fetched in one request. Any other big file (a PDF, a
 * Keynote deck, a video) is written as a sparse placeholder of 256 KB: the rules read only text and the
 * size of images, so validate and the generator see the course as a full checkout would show it.
 *
 * Needs git and Deno: the generator runs under Deno (lib/gen-dropped-cli.ts), as it does for lecturers.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, ftruncateSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import yaml from "js-yaml";
import type { Finding } from "../../packages/jsr/course-rules/src/mod.ts";
import { diskCourse } from "../../packages/jsr/create/src/course-fs.ts";
import { runValidate } from "../../packages/jsr/create/src/validate-cli.ts";
import { REPO_ROOT } from "./lib/repo.ts";
import { diffCourse, fixSettles, genAgreement, passes, summary, toBaseline, type Baseline, type CourseDiff, type GenAgreement } from "./lib/validate-corpus.ts";

const WORK = join(REPO_ROOT, ".validate-corpus");
const MANIFEST = join(REPO_ROOT, "tests/validate-corpus/corpus.yaml");
const BASELINE = join(REPO_ROOT, "tests/validate-corpus/baseline.json");
const BLOB_LIMIT = 256 * 1024;
/** Files validate and the generator read as text; anything else they only list or size. */
const TEXT = /(^|\/)[^./]+$|\.(md|markdown|yaml|yml|toml|marp|json|txt|csv)$/i;
const IMAGE = /\.(png|jpe?g|gif|svg|webp|bmp|ico|avif|tiff?)$/i;

interface CorpusCourse {
  name: string;
  repo: string;
  commit: string;
  why: string;
}

function loadCorpus(): CorpusCourse[] {
  const raw = yaml.load(readFileSync(MANIFEST, "utf8")) as { corpus?: CorpusCourse[] };
  const courses = raw?.corpus ?? [];
  for (const c of courses) {
    if (!/^[a-z0-9-]+$/.test(c.name ?? "")) throw new Error(`${MANIFEST}: name "${c.name}" must be lower-case letters, digits and dashes`);
    if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+?(\.git)?$/.test(c.repo ?? "")) throw new Error(`${MANIFEST}: ${c.name}: repo must be a https://github.com/owner/name URL`);
    if (!/^[0-9a-f]{40}$/.test(c.commit ?? "")) throw new Error(`${MANIFEST}: ${c.name}: commit must be a full 40-character SHA`);
    if ((c.why ?? "").length < 10) throw new Error(`${MANIFEST}: ${c.name}: say why the course is in the corpus`);
  }
  return courses;
}

const git = (args: string[], cwd: string, input?: string) => execFileSync("git", args, { cwd, input, stdio: ["pipe", "pipe", "pipe"], maxBuffer: 512 * 1024 * 1024 });

/** The commit's blobs under 256 KB, fetched once into a partial clone. */
function store(course: CorpusCourse): string {
  const dir = join(WORK, "sources", `${course.name}-${course.commit.slice(0, 12)}`);
  if (existsSync(join(dir, ".git", "fetched"))) return dir;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(["init", "--quiet"], dir);
  git(["remote", "add", "origin", course.repo], dir);
  git(["fetch", "--quiet", "--depth", "1", `--filter=blob:limit=${BLOB_LIMIT}`, "origin", course.commit], dir);
  writeFileSync(join(dir, ".git", "fetched"), course.commit);
  return dir;
}

/** Reads blobs through one `git cat-file --batch`; a blob the partial clone skipped is fetched on demand. */
function readBlobs(dir: string, shas: string[]): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  if (shas.length === 0) return out;
  const raw = git(["cat-file", "--batch"], dir, shas.join("\n") + "\n");
  let at = 0;
  while (at < raw.length) {
    const end = raw.indexOf(10, at);
    const [sha, type, size] = raw.subarray(at, end).toString("utf8").split(" ");
    if (type === "missing") throw new Error(`blob ${sha} is missing from the partial clone`);
    const bytes = Number(size);
    out.set(sha, raw.subarray(end + 1, end + 1 + bytes));
    at = end + 1 + bytes + 1;
  }
  return out;
}

/** The course as files on disk: every text and image blob whole, any other big file (a deck, a video) as a sparse placeholder. */
function materialise(course: CorpusCourse): string {
  const source = store(course);
  const tree = git(["ls-tree", "-r", "-z", course.commit], source)
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .map((line) => {
      const [meta, path] = line.split("\t");
      const [mode, type, sha] = meta.split(" ");
      return { mode, type, sha, path };
    })
    .filter((e) => e.type === "blob" && e.mode !== "120000");
  const present = new Set(
    git(["cat-file", "--batch-check", "--batch-all-objects"], source)
      .toString("utf8")
      .split("\n")
      .filter((l) => l.includes(" blob "))
      .map((l) => l.split(" ")[0])
  );
  // Text is read and an image's size is reported (V009), so those are fetched whole, in one request.
  const wanted = [...new Set(tree.filter((e) => !present.has(e.sha) && (TEXT.test(e.path) || IMAGE.test(e.path))).map((e) => e.sha))];
  if (wanted.length > 0) {
    git(
      ["-c", "fetch.negotiationAlgorithm=noop", "fetch", "--quiet", "--no-tags", "--no-write-fetch-head", "--filter=blob:none", "--stdin", "origin"],
      source,
      wanted.join("\n") + "\n"
    );
    wanted.forEach((sha) => present.add(sha));
  }
  const blobs = readBlobs(source, [...new Set(tree.filter((e) => present.has(e.sha)).map((e) => e.sha))]);
  const root = join(WORK, "courses", course.name);
  rmSync(root, { recursive: true, force: true });
  for (const entry of tree) {
    const file = join(root, entry.path);
    mkdirSync(dirname(file), { recursive: true });
    const bytes = blobs.get(entry.sha);
    if (bytes) writeFileSync(file, bytes);
    else {
      // No rule reads these or their size, so they stand at the clone's limit: at least that big.
      const fd = openSync(file, "w");
      ftruncateSync(fd, BLOB_LIMIT);
      closeSync(fd);
    }
  }
  return root.replaceAll("\\", "/");
}

/** The folders the generator leaves out of the course, from the generator itself under Deno. */
function droppedByGen(root: string): string[] {
  const out = execFileSync("deno", ["run", "-A", "--no-check", "--no-lock", "--node-modules-dir=none", "--quiet", join(REPO_ROOT, "scripts/checks/lib/gen-dropped-cli.ts"), root], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024
  });
  return JSON.parse(out.trim().split("\n").pop() ?? "[]") as string[];
}

function parseArgs(argv: string[]) {
  const options = { update: false, only: undefined as string[] | undefined, summary: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--update") options.update = true;
    else if (argv[i] === "--corpus") options.only = argv[++i].split(",");
    else if (argv[i] === "--summary") options.summary = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return options;
}

/** tutors validate as Netlify runs it, in process: its exit status, stdout and stderr. */
async function cli(args: string[]): Promise<{ status: number; out: string; err: string }> {
  let out = "";
  let err = "";
  const status = await runValidate(args, { out: (t) => (out += t), err: (t) => (err += t) });
  return { status, out, err };
}

/** The findings `tutors validate --format json` prints, and a problem when its exit status doesn't match them (Rule 0701). */
async function viaCli(root: string): Promise<{ findings: Finding[]; problem?: string }> {
  const { status, out, err } = await cli([root, "--format", "json"]);
  if (status === 3) throw new Error(`tutors validate could not read ${root}: ${err.trim()}`);
  const findings = JSON.parse(out) as Finding[];
  const expected = findings.some((f) => f.severity === "error") ? 1 : 0;
  return status === expected ? { findings } : { findings, problem: `tutors validate exited ${status} for ${expected === 1 ? "a course with errors" : "a course without errors"}` };
}

/** The operations a `tutors validate --fix` run applied, from the fix log it writes to stderr beside a JSON report. */
const fixedBy = ({ err }: { err: string }): string[] =>
  err
    .split("\n")
    .filter((l) => l.startsWith("fixed "))
    .map((l) => l.slice("fixed ".length).trim());

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  const corpus = loadCorpus().filter((c) => !options.only || options.only.includes(c.name));
  if (options.only && corpus.length !== options.only.length) throw new Error(`unknown corpus course in ${options.only.join(",")}`);
  const baseline: Baseline = existsSync(BASELINE) ? (JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline) : { courses: {} };
  const diffs: CourseDiff[] = [];
  const agreements: GenAgreement[] = [];
  const fixes: Record<string, string[]> = {};
  const cliProblems: string[] = [];
  for (const course of corpus) {
    const root = materialise(course);
    // Through the command Netlify runs (runValidate, as `tutors validate --format json`), not only its core.
    const { findings, problem } = await viaCli(root);
    if (problem) cliProblems.push(`${course.name}: ${problem}`);
    const current = toBaseline(findings);
    if (options.update) baseline.courses[course.name] = { commit: course.commit, findings: current };
    diffs.push(diffCourse(course.name, course.commit, baseline.courses[course.name], current));
    agreements.push(genAgreement(course.name, findings, droppedByGen(root)));
    // Last: --fix changes the materialised copy, which the next run rebuilds.
    fixes[course.name] = await fixSettles(
      diskCourse(root),
      async () => (await viaCli(root)).findings,
      async () => fixedBy(await cli([root, "--fix", "--format", "json"]))
    );
    process.stdout.write(`${course.name}: ${findings.length} findings, ${findings.filter((f) => f.severity === "error").length} errors\n`);
  }
  if (options.update) {
    const known = new Set(loadCorpus().map((c) => c.name));
    for (const name of Object.keys(baseline.courses)) if (!known.has(name)) delete baseline.courses[name];
    const sorted: Baseline = { courses: Object.fromEntries(Object.entries(baseline.courses).sort(([a], [b]) => a.localeCompare(b))) };
    writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n");
    process.stdout.write(`Recorded ${corpus.length} courses in ${BASELINE}.\n`);
  }
  const text = summary(diffs, agreements, fixes) + cliProblems.map((p) => `\n${p}\n`).join("");
  process.stdout.write("\n" + text);
  if (options.summary) writeFileSync(options.summary, "### Validate corpus\n\n```\n" + text + "```\n", { flag: "a" });
  return passes(diffs, agreements, fixes) && cliProblems.length === 0 ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`validate corpus: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
);
