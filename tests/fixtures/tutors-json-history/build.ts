/* global Deno */
/**
 * Writes the tutors.json that each published generator release produces for the synthetic corpus
 * course, so the reader is tested against files lecturers' builds really contain (Rule 0269).
 *
 *   deno run -A --no-lock tests/fixtures/tutors-json-history/build.ts [version ...]
 *
 * Lecturers run `deno run -A jsr:@tutors/tutors`, which takes whatever @tutors/tutors-gen-lib the caret
 * range allows on the day they build, and a course stays published as built. So live courses carry
 * tutors.json from many generator releases at once. Each release here is imported at its exact
 * version from JSR; the model-lib it depends on resolves by its own caret range, as it did for
 * lecturers. Output: <version>/tutors.json beside this script, plus versions.json recording what ran.
 * Re-run it to add a release; the files are committed, so tests never touch the network.
 */
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

/** One release per line that lecturers built with, oldest first. */
const RELEASES = ["4.1.0", "4.2.0", "4.2.20", "5.0.0", "5.1.2", "5.2.3", "5.3.0"];

const here = fileURLToPath(new URL(".", import.meta.url));
const course = join(here, "../../generator/corpus/synthetic-course");
const versions = Deno.args.length > 0 ? Deno.args : RELEASES;

const ran: Record<string, string> = {};
for (const version of versions) {
  const gen = await import(`jsr:@tutors/tutors-gen-lib@${version}`);
  // A dot-free folder: older releases took lab step ids from the first "." in the absolute path.
  const root = join(mkdtempSync(join(tmpdir(), "tutors-history-")), "synthetic-course");
  cpSync(course, root, { recursive: true });
  // 4.x returned the course; 5.x returns [course, learningResource].
  const parsed = gen.parseCourse(root, true);
  const lo = Array.isArray(parsed) ? parsed[0] : parsed;
  const out = join(here, version);
  mkdirSync(out, { recursive: true });
  // As generateDynamicCourse writes it.
  writeFileSync(join(out, "tutors.json"), JSON.stringify(lo));
  ran[version] = `jsr:@tutors/tutors-gen-lib@${version}`;
  process.stdout.write(`${version}: ${readFileSync(join(out, "tutors.json")).length} bytes\n`);
}
const index = join(here, "versions.json");
let previous: Record<string, string> = {};
try {
  previous = JSON.parse(readFileSync(index, "utf8"));
} catch {
  /* first run */
}
writeFileSync(index, `${JSON.stringify({ ...previous, ...ran }, null, 2)}\n`);
