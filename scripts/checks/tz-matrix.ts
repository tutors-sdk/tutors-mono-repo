/**
 * Timezone matrix (runway tier B): run the unit and property suites under each
 * timezone the time dashboard's users live in. The time dashboard is where
 * timezone bugs hide, and CI runners are always UTC.
 *
 *   pnpm test:tz                         # every zone, full unit suite + property suites
 *   pnpm test:tz -- tests/unit/time      # restrict the unit run to some paths
 *
 * Failures are ratcheted against tests/fuzz/known-timezone-failures.txt: a new
 * failure fails the matrix, and so does a baseline entry that now passes.
 *
 * Each run asserts the zone really applied (tests/fuzz/calendar-time.fuzz.test.ts),
 * so a shell that drops TZ fails instead of silently testing the host zone three times.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describeRatchet, ratchet } from "./lib/ratchet.ts";
import { REPO_ROOT, readBaseline, toPosix } from "./lib/repo.ts";

export const TIMEZONES = ["UTC", "Europe/Dublin", "Pacific/Auckland"] as const;
const BASELINE = "tests/fuzz/known-timezone-failures.txt";

const require = createRequire(import.meta.url);
// vitest does not export its bin; resolve it next to its package.json.
const vitest = join(dirname(require.resolve("vitest/package.json")), "vitest.mjs");

interface JsonReport {
  numTotalTests: number;
  testResults: { name: string; assertionResults: { fullName: string; status: string }[] }[];
}

/** Run one vitest invocation under `zone`; return failed tests as baseline lines, or undefined when no report was written. */
function run(zone: string, args: readonly string[], out: string, index: number): { failed: string[]; total: number } | undefined {
  const report = join(out, `${index}.json`);
  spawnSync(process.execPath, [vitest, "run", ...args, "--reporter=default", "--reporter=json", `--outputFile.json=${report}`], {
    cwd: REPO_ROOT,
    // TZ_MATRIX_ZONE lets the suite assert the zone really applied (shells such as MSYS drop or rewrite TZ).
    env: { ...process.env, TZ: zone, TZ_MATRIX_ZONE: zone },
    stdio: "inherit"
  });
  let parsed: JsonReport;
  try {
    parsed = JSON.parse(readFileSync(report, "utf8"));
  } catch {
    return undefined;
  }
  const failed = parsed.testResults.flatMap((file) =>
    file.assertionResults
      .filter((test) => test.status === "failed")
      .map((test) => `${zone} :: ${toPosix(file.name)} :: ${test.fullName}`)
  );
  return { failed, total: parsed.numTotalTests };
}

const unitPaths = process.argv.slice(2).filter((arg) => arg !== "--");
const out = mkdtempSync(join(tmpdir(), "tz-matrix-"));
const failures: string[] = [];
const broken: string[] = [];

try {
  let index = 0;
  for (const zone of TIMEZONES) {
    console.log(`\n=== TZ=${zone} ===`);
    const runs: [string, readonly string[]][] = [
      ["unit suite", unitPaths],
      ["property suites", ["--config", "vitest.config.fuzz.ts"]]
    ];
    for (const [label, args] of runs) {
      const result = run(zone, args, out, index++);
      if (!result || result.total === 0) broken.push(`${zone}: ${label} produced no report`);
      else failures.push(...result.failed);
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

// A restricted run cannot see entries for other paths, so it only ratchets the entries it covered.
const baseline = readBaseline(join(REPO_ROOT, BASELINE)).filter(
  (entry) => unitPaths.length === 0 || unitPaths.some((path) => entry.split(" :: ")[1]?.startsWith(path.replace(/\\/g, "/")))
);
const result = ratchet(failures, baseline);

if (broken.length > 0 || result.added.length > 0 || result.stale.length > 0) {
  const details = [...broken, describeRatchet("timezone matrix", BASELINE, result)].filter(Boolean);
  console.error(`\nTimezone matrix failed.\n${details.join("\n")}`);
  process.exit(1);
}
console.log(`\nTimezone matrix passed: ${TIMEZONES.join(", ")} (${failures.length} known failure(s) in ${BASELINE})`);
