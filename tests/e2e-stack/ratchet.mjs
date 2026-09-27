// Shrink-only ratchet for the tier G accessibility and reduced-motion baselines.
//
//   node tests/e2e-stack/ratchet.mjs            # after a journey run: fail on stale baseline lines
//   node tests/e2e-stack/ratchet.mjs --write    # rewrite baselines from what the run observed
//
// The journeys themselves fail on new findings. This script closes the other
// half: a baseline line for a project that ran, on a page that was audited,
// that no longer occurs means something was fixed, so the line must go.
// --write is for the day a check is introduced or a project added; review the
// diff, it must only ever remove lines otherwise.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const observedFile = resolve(process.env.E2E_OBSERVED_FILE ?? resolve(here, "../../test-results/e2e-stack-observed.jsonl"));
const baselines = {
  a11y: resolve(here, "a11y-known-violations.txt"),
  motion: resolve(here, "reduced-motion-known.txt")
};

if (!existsSync(observedFile)) {
  process.stderr.write(`No observations at ${observedFile}. Run the journeys first.\n`);
  process.exit(1);
}

const records = readFileSync(observedFile, "utf8")
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => JSON.parse(line));

let failures = 0;
for (const [kind, file] of Object.entries(baselines)) {
  const mine = records.filter((r) => r.kind === kind);
  const observed = new Set(mine.flatMap((r) => r.keys));
  const audited = new Set(mine.map((r) => `${r.project} | ${r.page}`));
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  const header = text.split(/\r?\n/).filter((line) => line.startsWith("#"));
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  if (process.argv.includes("--write")) {
    // Keep lines for projects or pages this run did not audit.
    const kept = lines.filter((line) => !audited.has(line.split(" :: ")[0]));
    const next = [...new Set([...kept, ...observed])].sort();
    writeFileSync(file, `${[...header, ...next].join("\n")}\n`);
    process.stdout.write(`${kind}: wrote ${next.length} line(s) to ${file}\n`);
    continue;
  }

  const stale = lines.filter((line) => audited.has(line.split(" :: ")[0]) && !observed.has(line));
  if (stale.length > 0) {
    failures += stale.length;
    process.stderr.write(`${kind}: ${stale.length} baseline line(s) no longer occur. Delete them from ${file}:\n`);
    for (const line of stale) process.stderr.write(`  - ${line}\n`);
  } else {
    process.stdout.write(`${kind}: baseline has no stale lines for the ${audited.size} page audit(s) in this run\n`);
  }
}
process.exit(failures > 0 ? 1 : 0);
