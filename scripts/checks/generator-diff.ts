/**
 * Generator differential and corpus contract (runway tier C).
 *
 *   pnpm check:generator-diff                       # base = merge-base with origin/main
 *   pnpm check:generator-diff --base main --corpus synthetic --generators tutors
 *   pnpm check:generator-diff --plant               # self-test: a planted one-character change must be caught
 *   pnpm check:generator-diff --nightly --store .generator-store [--fail-on-diff]
 *
 * PR mode generates every corpus entry (tests/generator/corpus.yaml) with the
 * generators at the base ref and in the working tree, normalises both (masks
 * and their reasons: MASKS in generator-compare.ts), diffs them and requires
 * every hunk to be claimed in tests/generator/claims.yaml.
 *
 * Nightly mode regenerates the `nightly: true` courses at their upstream HEAD
 * with the working-tree generator and diffs against the snapshot stored by the
 * previous night, so upstream content changes are seen before a lecturer
 * reports a broken course.
 *
 * Needs Deno and git. The base generator is materialised with `git archive`
 * (deno.json, deno.lock, packages/jsr only), the candidate is copied from the
 * working tree, and each runs with its own deno.json so workspace packages
 * resolve inside that tree.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  MASKS,
  SILENT_FAILURES,
  diffSnapshots,
  formatHunk,
  matchClaims,
  outputFolder,
  parseClaims,
  parseCorpusManifest,
  snapshotDirectory,
  type CorpusEntry,
  type GeneratorName,
  type Hunk,
  type Snapshot
} from "./generator-compare.ts";
import { REPO_ROOT } from "./lib/repo.ts";

// Outside tests/ so Vitest never collects the materialised generator trees.
const WORK = join(REPO_ROOT, ".generator-diff");
const MANIFEST = join(REPO_ROOT, "tests/generator/corpus.yaml");
const CLAIMS = join(REPO_ROOT, "tests/generator/claims.yaml");
const GENERATOR_PATHS = ["deno.json", "deno.lock", "packages/jsr"];

/** One-character changes the self-test plants in the candidate; each must surface as a hunk in `expect`. */
const PLANTS: { file: string; from: string; to: string; generator: GeneratorName; expect: RegExp }[] = [
  {
    file: "packages/jsr/gen/src/utils/llms.ts",
    from: "<SYSTEM> This is the Tutors course ${course.title} by",
    to: "<SYSTEM> This is the Tutors Course ${course.title} by",
    generator: "tutors",
    expect: /^llms\//
  },
  {
    file: "packages/jsr/gen/src/templates/vento/Note.vto",
    from: 'class="mr-10 ml-10',
    to: 'class="mr-11 ml-10',
    generator: "tutors-lite",
    expect: /\.(html|vto)$/
  }
];

interface Options {
  base: string;
  corpus?: string[];
  generators?: GeneratorName[];
  report: string;
  approveBroad: boolean;
  plant: boolean;
  nightly: boolean;
  store?: string;
  failOnDiff: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    base: "origin/main",
    report: join(WORK, "report"),
    approveBroad: false,
    plant: false,
    nightly: false,
    failOnDiff: false
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--base") options.base = argv[++i];
    else if (arg === "--corpus") options.corpus = argv[++i].split(",");
    else if (arg === "--generators") options.generators = argv[++i].split(",") as GeneratorName[];
    else if (arg === "--report") options.report = resolve(argv[++i]);
    else if (arg === "--approve-broad") options.approveBroad = true;
    else if (arg === "--plant") options.plant = true;
    else if (arg === "--nightly") options.nightly = true;
    else if (arg === "--store") options.store = resolve(argv[++i]);
    else if (arg === "--fail-on-diff") options.failOnDiff = true;
    else {
      console.error(`unknown argument ${arg}`);
      process.exit(2);
    }
  }
  if (options.nightly && !options.store) {
    console.error("--nightly needs --store <dir>");
    process.exit(2);
  }
  return options;
}

const git = (args: string[], cwd = REPO_ROOT) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 }).trim();

const annotate = (level: "error" | "warning" | "notice", message: string) => {
  if (process.env.GITHUB_ACTIONS) console.log(`::${level}::${message.replaceAll("\n", "%0A")}`);
};

/* ---------------- trees ---------------- */

function materialiseBase(commit: string): string {
  const dir = join(WORK, "trees", `base-${commit.slice(0, 12)}`);
  if (existsSync(join(dir, ".complete"))) return dir;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const tarball = join(WORK, "trees", `base-${commit.slice(0, 12)}.tar`);
  git(["archive", "--format=tar", "-o", tarball, commit, ...GENERATOR_PATHS]);
  // A relative archive path: GNU tar on Windows reads "D:\..." as a remote host.
  execFileSync("tar", ["-xf", `../base-${commit.slice(0, 12)}.tar`], { cwd: dir, stdio: "inherit" });
  rmSync(tarball, { force: true });
  writeFileSync(join(dir, ".complete"), commit);
  return dir;
}

function materialiseCandidate(plant: boolean): string {
  const dir = join(WORK, "trees", plant ? "candidate-planted" : "candidate");
  mkdirSync(dir, { recursive: true });
  for (const path of GENERATOR_PATHS) {
    // Replace the sources but keep the tree's node_modules: Deno's npm install there costs most of a run.
    rmSync(join(dir, path), { recursive: true, force: true });
    cpSync(join(REPO_ROOT, path), join(dir, path), {
      recursive: true,
      filter: (source) => !/[\\/](node_modules|json|html)([\\/]|$)/.test(source.slice(REPO_ROOT.length))
    });
  }
  if (plant) {
    for (const { file, from, to } of PLANTS) {
      const path = join(dir, file);
      const text = readFileSync(path, "utf8");
      if (!text.includes(from)) throw new Error(`plant target not found in ${file}: ${from}. Update PLANTS.`);
      writeFileSync(path, text.replace(from, to));
    }
  }
  return dir;
}

/* ---------------- corpus sources ---------------- */

function fetchGitSource(name: string, repo: string, commit: string): string {
  const dir = join(WORK, "sources", `${name}-${commit.slice(0, 12)}`);
  if (existsSync(join(dir, "course.md"))) return dir;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  git(["init", "--quiet"], dir);
  git(["fetch", "--quiet", "--depth", "1", repo, commit], dir);
  git(["checkout", "--quiet", "FETCH_HEAD"], dir);
  return dir;
}

function sourceFor(entry: CorpusEntry, upstreamHead = false): { dir: string; revision: string } {
  if ("local" in entry.source) return { dir: join(REPO_ROOT, entry.source.local), revision: "local" };
  const commit = upstreamHead ? git(["ls-remote", entry.source.repo, "HEAD"]).split(/\s+/)[0] : entry.source.commit;
  return { dir: fetchGitSource(entry.name, entry.source.repo, commit), revision: commit };
}

/* ---------------- generation ---------------- */

/**
 * Where courses are generated. Always the same absolute path, so both sides see
 * identical inputs, and free of dots: generators before the dotted-path fix
 * derived lab step ids from the first "." in the absolute file path (buildLab
 * in course-builder.ts), so under a dotted directory such as .claude or
 * .generator-diff a base ref from before the fix gets broken step ids and
 * tutors-lite fails outright.
 */
const COURSES = join(tmpdir(), "tutors-generator-diff");

function generate(tree: string, generator: GeneratorName, source: string, corpus: string): Snapshot {
  const course = join(COURSES, corpus);
  if (course.includes(".")) {
    throw new Error(`course path ${course} contains a "." and would trip the lab step id bug in older base generators; set TMPDIR to a dot-free directory`);
  }
  rmSync(course, { recursive: true, force: true });
  cpSync(source, course, {
    recursive: true,
    filter: (path) => !/[\\/](\.git|json|html)$/.test(path)
  });

  const result = spawnSync("deno", ["run", "-A", "--config", join(tree, "deno.json"), join(tree, "packages/jsr", generator, "main.ts")], {
    cwd: course,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", DENO_NO_UPDATE_CHECK: "1" },
    maxBuffer: 256 * 1024 * 1024
  });
  const log = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const silent = SILENT_FAILURES.find((pattern) => pattern.test(log));
  if (result.status !== 0 || silent || result.error) {
    const tail = log.trim().split("\n").slice(-15).join("\n");
    throw new Error(`${corpus}/${generator} failed with ${tree}: ${result.error?.message ?? silent ?? `exit ${result.status}`}\n${tail}`);
  }
  const output = join(course, outputFolder(generator));
  if (!existsSync(output)) throw new Error(`${corpus}/${generator} produced no ${outputFolder(generator)}/ folder`);
  const snapshot = snapshotDirectory(output, course);
  if (generator === "tutors-lite") assertLocalTemplates(tree, snapshot, `${corpus}/${generator}`);
  return snapshot;
}

/**
 * tutors-lite falls back to downloading templates from GitHub main when it
 * cannot find the local ones. Rendered that way, both sides use main's
 * templates and a template change is invisible, so treat it as a failure.
 */
function assertLocalTemplates(tree: string, snapshot: Snapshot, label: string) {
  const expected = snapshotDirectory(join(tree, "packages/jsr/gen/src/templates/vento"));
  const mismatched = Object.keys(expected).filter((file) => JSON.stringify(snapshot[`vento/${file}`]) !== JSON.stringify(expected[file]));
  if (mismatched.length > 0) {
    throw new Error(`${label} rendered with templates that are not this tree's (downloaded from GitHub?): ${mismatched.slice(0, 3).join(", ")}`);
  }
}

function saveSnapshot(root: string, corpus: string, generator: string, snapshot: Snapshot) {
  mkdirSync(join(root, corpus), { recursive: true });
  writeFileSync(join(root, corpus, `${generator}.json`), JSON.stringify(snapshot));
}

function loadSnapshot(root: string, corpus: string, generator: string): Snapshot | undefined {
  const path = join(root, corpus, `${generator}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined;
}

function selectedEntries(options: Options): CorpusEntry[] {
  const entries = parseCorpusManifest(readFileSync(MANIFEST, "utf8"));
  const names = options.corpus ?? (options.plant ? ["synthetic"] : undefined);
  const selected = names ? entries.filter((entry) => names.includes(entry.name)) : entries;
  if (names && selected.length !== names.length) throw new Error(`unknown corpus entry in ${names.join(",")}`);
  return selected;
}

function generatorsFor(entry: CorpusEntry, options: Options): GeneratorName[] {
  return entry.generators.filter((g) => !options.generators || options.generators.includes(g));
}

/* ---------------- modes ---------------- */

function runDifferential(options: Options): number {
  const baseCommit = options.plant ? git(["rev-parse", "HEAD"]) : git(["merge-base", options.base, "HEAD"]);
  console.log(`base ${options.plant ? "HEAD" : options.base} -> ${baseCommit.slice(0, 12)}; candidate = working tree${options.plant ? " + planted changes" : ""}`);
  const baseTree = materialiseBase(baseCommit);
  const candidateTree = materialiseCandidate(options.plant);
  rmSync(options.report, { recursive: true, force: true });

  const hunks: Hunk[] = [];
  const failures: string[] = [];
  const baseFailures: string[] = [];
  for (const entry of selectedEntries(options)) {
    const { dir } = sourceFor(entry);
    for (const generator of generatorsFor(entry, options)) {
      const started = Date.now();
      let base: Snapshot | undefined;
      try {
        base = generate(baseTree, generator, dir, entry.name);
        saveSnapshot(join(options.report, "base"), entry.name, generator, base);
      } catch (error) {
        // Already broken at the base: this change cannot be compared, only required not to stay broken.
        const message = `base generation failed, nothing to compare: ${(error as Error).message}`;
        baseFailures.push(message);
        console.warn(`WARN ${message}`);
        annotate("warning", message.split("\n")[0]);
      }
      try {
        const candidate = generate(candidateTree, generator, dir, entry.name);
        saveSnapshot(join(options.report, "candidate"), entry.name, generator, candidate);
        const found = base ? diffSnapshots(entry.name, generator, base, candidate) : [];
        hunks.push(...found);
        console.log(
          `${entry.name}/${generator}: ${Object.keys(candidate).length} files, ${base ? `${found.length} hunk(s)` : "no base to diff"} in ${Math.round((Date.now() - started) / 1000)} s`
        );
      } catch (error) {
        failures.push((error as Error).message);
        console.error(`FAIL ${(error as Error).message}`);
        annotate("error", (error as Error).message.split("\n")[0]);
      }
    }
  }

  if (options.plant) return reportPlant(hunks, failures, options);

  const { claims, errors } = parseClaims(readFileSync(CLAIMS, "utf8"));
  const result = matchClaims(hunks, claims, { approveBroad: options.approveBroad });
  for (const error of errors) {
    console.error(`claims.yaml: ${error}`);
    annotate("error", `tests/generator/claims.yaml: ${error}`);
  }
  for (const { hunk, claim } of result.claimed) console.log(`claimed   ${formatHunk(hunk)}  <- ${claim.reason}`);
  for (const hunk of result.unclaimed) {
    console.log(`UNCLAIMED ${formatHunk(hunk)}`);
    annotate("error", `Unclaimed generator output change: ${formatHunk(hunk)}`);
  }
  for (const claim of result.stale) {
    console.log(`stale claim (matches nothing): ${claim.path}${claim.pointer ? `#${claim.pointer}` : ""} ${claim.reason}`);
    annotate("warning", `Stale generator claim: ${claim.path} (${claim.reason})`);
  }
  for (const claim of result.unapprovedBroad) {
    console.log(`broad claim ignored until approved: ${claim.path} ${claim.reason}`);
    annotate("warning", `Broad generator claim needs the approve-broad-claim label: ${claim.path}`);
  }

  mkdirSync(options.report, { recursive: true });
  writeFileSync(
    join(options.report, "report.json"),
    JSON.stringify({ base: baseCommit, masks: MASKS, failures, baseFailures, claimErrors: errors, ...result }, null, 2)
  );
  writeSummary(baseCommit, result.unclaimed, result.claimed.length, result.stale.length, failures);

  const failed = failures.length > 0 || errors.length > 0 || result.unclaimed.length > 0;
  console.log(
    `\n${hunks.length} hunk(s): ${result.claimed.length} claimed, ${result.unclaimed.length} unclaimed; ${result.stale.length} stale claim(s); ${failures.length} generation failure(s).`
  );
  if (result.unclaimed.length > 0) {
    console.log("Claim intended changes in tests/generator/claims.yaml, citing the issue, PR or CHANGELOG entry.");
  }
  return failed ? 1 : 0;
}

function reportPlant(hunks: Hunk[], failures: string[], options: Options): number {
  let ok = failures.length === 0;
  for (const plant of PLANTS) {
    if (options.generators && !options.generators.includes(plant.generator)) continue;
    const caught = hunks.filter((hunk) => hunk.generator === plant.generator && plant.expect.test(hunk.file));
    if (caught.length === 0) {
      ok = false;
      console.error(`NOT CAUGHT: planted change in ${plant.file} produced no ${plant.generator} hunk. The differential has lost its teeth.`);
      annotate("error", `Generator differential missed the planted change in ${plant.file}`);
    } else {
      console.log(`caught: ${plant.file} -> ${caught.length} unclaimed hunk(s), e.g. ${formatHunk(caught[0])}`);
    }
  }
  return ok ? 0 : 1;
}

function runNightly(options: Options): number {
  const store = options.store!;
  const previous = join(store, "previous");
  const current = join(store, "current");
  // CI restores last night's snapshot as `previous`; a store reused across runs rotates `current` into it.
  if (existsSync(current)) {
    rmSync(previous, { recursive: true, force: true });
    renameSync(current, previous);
  }
  rmSync(current, { recursive: true, force: true });
  mkdirSync(current, { recursive: true });

  const generatorCommit = git(["rev-parse", "HEAD"]);
  const candidateTree = materialiseCandidate(false);
  const previousMeta = existsSync(join(previous, "meta.json")) ? JSON.parse(readFileSync(join(previous, "meta.json"), "utf8")) : undefined;
  const meta: Record<string, unknown> = { generatorCommit, generatedAt: new Date().toISOString(), upstream: {} };

  const hunks: Hunk[] = [];
  const failures: string[] = [];
  for (const entry of selectedEntries(options).filter((e) => e.nightly)) {
    const { dir, revision } = sourceFor(entry, true);
    (meta.upstream as Record<string, string>)[entry.name] = revision;
    for (const generator of generatorsFor(entry, options)) {
      try {
        const snapshot = generate(candidateTree, generator, dir, entry.name);
        saveSnapshot(current, entry.name, generator, snapshot);
        const before = loadSnapshot(previous, entry.name, generator);
        if (!before) {
          console.log(`${entry.name}/${generator}: first snapshot at ${revision.slice(0, 12)}`);
          continue;
        }
        const found = diffSnapshots(entry.name, generator, before, snapshot);
        hunks.push(...found);
        console.log(`${entry.name}/${generator}: ${found.length} hunk(s) since last night`);
      } catch (error) {
        failures.push((error as Error).message);
        console.error(`FAIL ${(error as Error).message}`);
        annotate("error", (error as Error).message.split("\n")[0]);
      }
    }
  }
  writeFileSync(join(current, "meta.json"), JSON.stringify(meta, null, 2));

  if (previousMeta) {
    const upstreamBefore = previousMeta.upstream as Record<string, string>;
    const upstreamNow = meta.upstream as Record<string, string>;
    for (const name of Object.keys(upstreamNow)) {
      const cause = [
        upstreamBefore?.[name] !== upstreamNow[name] ? `upstream ${upstreamBefore?.[name]?.slice(0, 12) ?? "?"} -> ${upstreamNow[name].slice(0, 12)}` : undefined,
        previousMeta.generatorCommit !== generatorCommit ? `generator ${String(previousMeta.generatorCommit).slice(0, 12)} -> ${generatorCommit.slice(0, 12)}` : undefined
      ].filter(Boolean);
      console.log(`${name}: ${cause.length ? cause.join("; ") : "no upstream or generator change"}`);
    }
  }
  for (const hunk of hunks) {
    console.log(`changed   ${formatHunk(hunk)}`);
    annotate("warning", `Corpus output changed since last night: ${formatHunk(hunk)}`);
  }
  writeFileSync(join(current, "report.json"), JSON.stringify({ previous: previousMeta, current: meta, failures, hunks }, null, 2));
  writeSummary(generatorCommit, hunks, 0, 0, failures, "Nightly corpus contract");

  if (failures.length > 0) return 1;
  return options.failOnDiff && hunks.length > 0 ? 1 : 0;
}

function writeSummary(base: string, unclaimed: Hunk[], claimed: number, stale: number, failures: string[], title = "Generator differential") {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  const lines = [
    `## ${title}`,
    "",
    `Base \`${base.slice(0, 12)}\`: ${unclaimed.length} unclaimed, ${claimed} claimed, ${stale} stale claim(s), ${failures.length} failure(s).`,
    ""
  ];
  if (unclaimed.length) {
    lines.push("| Corpus | Generator | Location | Change |", "| --- | --- | --- | --- |");
    for (const hunk of unclaimed.slice(0, 200)) {
      const where = hunk.pointer ? `${hunk.file}#${hunk.pointer}` : hunk.file;
      lines.push(`| ${hunk.corpus} | ${hunk.generator} | \`${where}\` | ${hunk.kind}: ${hunk.detail.replaceAll("|", "\\|")} |`);
    }
    if (unclaimed.length > 200) lines.push("", `...and ${unclaimed.length - 200} more (see report.json).`);
  }
  writeFileSync(file, `${lines.join("\n")}\n`, { flag: "a" });
}

try {
  const options = parseArgs(process.argv.slice(2));
  process.exitCode = options.nightly ? runNightly(options) : runDifferential(options);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
