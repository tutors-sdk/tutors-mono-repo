/**
 * Diff-aware dependency audit (runway tier M).
 *
 *   pnpm check:audit                       # nightly: every advisory must be allowed; expired allowances fail
 *   pnpm check:audit --base-dir base/      # PR: only advisories absent from base/pnpm-lock.yaml can fail
 *
 * `--base-dir` holds the base branch's pnpm-lock.yaml, package.json and
 * pnpm-workspace.yaml; `pnpm audit` needs nothing else. Allowances live in
 * tests/security/audit-allowlist.json, each with a reason and an expiry.
 */
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { auditFindings, parseAudit, type Advisory, type Allowance } from "./security.ts";
import { REPO_ROOT, readText } from "./lib/repo.ts";

function audit(dir: string): Advisory[] {
  // pnpm audit exits non-zero whenever it finds anything; the JSON is still complete.
  // A fixed command string through the shell, so pnpm's .cmd shim resolves on Windows too.
  const result = spawnSync("pnpm audit --json", { cwd: dir, encoding: "utf8", shell: true, maxBuffer: 64 * 1024 * 1024 });
  try {
    return parseAudit(result.stdout);
  } catch {
    process.stderr.write(`pnpm audit in ${dir} did not return JSON:\n${result.stdout}\n${result.stderr}\n`);
    process.exit(2);
  }
}

const baseIndex = process.argv.indexOf("--base-dir");
const baseDir = baseIndex > 0 ? resolve(process.argv[baseIndex + 1]) : undefined;

const allowances: Allowance[] = JSON.parse(readText(join(REPO_ROOT, "tests/security/audit-allowlist.json"))).allowances;
const current = audit(REPO_ROOT);
const baseline = baseDir ? audit(baseDir) : undefined;
const { failures, warnings } = auditFindings(current, allowances, { today: new Date(), baseline });

process.stdout.write(`${current.length} advisory(ies) reported${baseline ? `, ${baseline.length} on the base branch` : ""}.\n`);
for (const line of warnings) {
  process.stdout.write(`warning: ${line}\n`);
  if (process.env.GITHUB_ACTIONS) process.stdout.write(`::warning file=tests/security/audit-allowlist.json::${line}\n`);
}
for (const line of failures) {
  process.stdout.write(`FAIL: ${line}\n`);
  if (process.env.GITHUB_ACTIONS) process.stdout.write(`::error file=pnpm-lock.yaml::${line}\n`);
}
if (failures.length > 0) {
  process.stderr.write(`\n${failures.length} failure(s). Upgrade or override the package, or add a dated allowance with a reason.\n`);
  process.exit(1);
}
