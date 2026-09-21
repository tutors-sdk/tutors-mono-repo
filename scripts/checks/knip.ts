/**
 * Unused files, exports and dependencies (runway tier A), ratcheted.
 *
 *   pnpm check:knip           # fails on new findings or stale baseline entries
 *   pnpm check:knip --print   # print every current finding, one per line
 *
 * Configuration: knip.json. Baseline: tests/architecture/known-knip.txt.
 */
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describeRatchet, ratchet } from "./lib/ratchet.ts";
import { REPO_ROOT, readBaseline } from "./lib/repo.ts";

const BASELINE = "tests/architecture/known-knip.txt";

/** Issue kinds that are findings; everything else knip reports is informational here. */
const KINDS = ["files", "dependencies", "devDependencies", "unlisted", "unresolved", "binaries", "exports", "types", "duplicates"] as const;

interface KnipIssue {
  file: string;
  [kind: string]: unknown;
}

/**
 * Flatten knip's JSON reporter output into `kind: file: name` lines. Plugins
 * may print to stdout before the JSON, so parsing starts at the first `{`.
 */
export function flattenKnipReport(stdout: string): string[] {
  const start = stdout.indexOf("{");
  if (start < 0) throw new Error(`knip produced no JSON report:\n${stdout.slice(0, 500)}`);
  const report = JSON.parse(stdout.slice(start)) as { issues: KnipIssue[] };
  const lines = new Set<string>();
  for (const issue of report.issues) {
    for (const kind of KINDS) {
      const entries = issue[kind];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (kind === "files") {
          lines.add(`unused-file: ${issue.file}`);
        } else if (kind === "duplicates" && Array.isArray(entry)) {
          lines.add(`duplicate-export: ${issue.file}: ${entry.map((e: { name: string }) => e.name).join(" = ")}`);
        } else {
          lines.add(`${kind}: ${issue.file}: ${(entry as { name: string }).name}`);
        }
      }
    }
  }
  return [...lines].sort();
}

function main() {
  const knip = join(REPO_ROOT, "node_modules/knip/bin/knip.js");
  const result = spawnSync(process.execPath, [knip, "--no-progress", "--reporter", "json", "--no-exit-code"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout + "\n");
    process.exit(result.status ?? 1);
  }
  const current = flattenKnipReport(result.stdout);
  if (process.argv.includes("--print")) {
    process.stdout.write(current.join("\n") + "\n");
    return;
  }
  const outcome = ratchet(current, readBaseline(resolve(REPO_ROOT, BASELINE)));
  if (outcome.added.length === 0 && outcome.stale.length === 0) {
    process.stdout.write(`knip: ${current.length} known finding(s), no new ones.\n`);
    return;
  }
  process.stderr.write(describeRatchet("knip", BASELINE, outcome) + "\n");
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
