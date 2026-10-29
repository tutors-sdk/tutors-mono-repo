/* global Deno */
/**
 * Builds the signed-in fixture course with the repo's own scaffolder and generator, for the signed-in journeys
 * (tests/e2e-stack/journeys/signed-in.journey.spec.ts, Rules 0606-0616). It is the release harness's Rule journeys'
 * course (tutors-release-harness fixtures/course-server/rules-course-build/build.ts) built from this checkout, so its
 * ids, users and seeds match the harness's identity and persistence stubs (fixtures/) and both suites read one course:
 * signed in and private, an enrollment list that names harness-enrolled only, a quiz, a notebook, a calendar on fixed
 * dates and the LLM page linked.
 *
 *   deno run -A --no-lock --node-modules-dir=none tests/e2e-stack/fixture-course/build-signed-in.ts [outDir]
 *
 * Output (default tests/e2e-stack/work/signed-in-course, git-ignored), served on port 8082 by compose.yaml.
 */
import { fileURLToPath } from "node:url";
import { writeCourseToFilesystem } from "../../../packages/jsr/create/src/scaffolder.ts";
import { copyAssets, generateDynamicCourse, parseCourse } from "../../../packages/jsr/gen/src/tutors.ts";

export const SIGNED_IN_SPEC = {
  courseName: "Harness Rules Course",
  lecturerName: "Tutors CI",
  courseId: "harness-rules",
  unitCount: 1,
  includeSide: false,
  topicsPerUnit: 2,
  includeNotes: true,
  includeLabs: true,
  includeCalendar: false,
  includeEnrollment: false,
  includeGitignore: false,
  includeReadme: false,
  readmeDescription: ""
};

const outDir = Deno.args[0] ?? fileURLToPath(new URL("../work/signed-in-course", import.meta.url));
const srcDir = await Deno.makeTempDir({ prefix: "tutors_signed_in_" });
await Deno.remove(outDir, { recursive: true }).catch(() => {});
writeCourseToFilesystem(SIGNED_IN_SPEC, srcDir);
const courseDir = `${srcDir}/${SIGNED_IN_SPEC.courseId}`;
const topic = `${courseDir}/unit-1/topic-01`;
const write = (path: string, lines: string[]) => Deno.writeTextFile(path, lines.join("\n") + "\n");

// Signed in, private, the LLM page linked. The whitelist names harness-enrolled only, so the identity stub's
// student (harness-student) is the one person turned away (Rule 0607); the lecturer is an educator.
await Deno.writeTextFile(`${courseDir}/properties.yaml`, ["", "auth: 1", "private: 1", "llm: 2", "ignorepin: 4321", ""].join("\n"), { append: true });
await write(`${courseDir}/enrollment.yaml`, ["educators:", "  - harness-lecturer", "whitelist:", "  - harness-enrolled", "students:", "  - name: Harness Enrolled Student", "    id: harness-enrolled"]);

// Fixed dates around the harness clock (HARNESS_NOW, 2026-09-16T09:05Z): week 2 is the current week.
await write(`${courseDir}/calendar.yaml`, [
  "title: Harness Rules Course Calendar",
  "year: 2026",
  "weeks:",
  "  - date: 2026-09-07",
  "    week: 1",
  "    topic: Week 1",
  "  - date: 2026-09-14",
  "    week: 2",
  "    topic: Week 2",
  "  - date: 2026-09-21",
  "    week: 3",
  "    topic: Week 3",
  "    assessment:",
  "      name: Assignment 1",
  "      due: 2026-09-25",
  "      percentage: 100",
  "      submission: GitHub",
  "  - date: 2026-09-28",
  "    topic: Reading Week"
]);

// A two-question quiz: one multiple choice, one true or false.
await Deno.mkdir(`${topic}/quiz-01`);
await write(`${topic}/quiz-01/quiz.md`, [
  "# Quiz 1",
  "",
  "Two questions on the lab.",
  "",
  "```quiz",
  "title: Quiz 1",
  "---",
  "question: Which keyword declares a constant?",
  "type: multiple-choice",
  "options:",
  "  - var",
  "  - let",
  "  - const",
  "correct: 2",
  "---",
  "question: A lab step can hold code.",
  "type: true-false",
  "correct: true",
  "```"
]);

// A notebook of one markdown cell and one code cell, never run by a journey (running fetches Pyodide).
await Deno.mkdir(`${topic}/notebook-01`);
await write(`${topic}/notebook-01/notebook.md`, ["# Notebook 1", "", "A notebook with one code cell."]);
await Deno.writeTextFile(
  `${topic}/notebook-01/notebook-01.ipynb`,
  JSON.stringify(
    {
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" }, language_info: { name: "python" } },
      cells: [
        { cell_type: "markdown", id: "intro", metadata: {}, source: ["## Adding\n", "\n", "Add two numbers."] },
        { cell_type: "code", id: "add", metadata: {}, execution_count: null, outputs: [], source: ["print(1 + 2)"] }
      ]
    },
    null,
    1
  ) + "\n"
);

// An empty whiteboard, as the harness's whiteboard journey (its Rule 0592) reads.
await Deno.mkdir(`${topic}/whiteboard-01`);
await write(`${topic}/whiteboard-01/whiteboard.md`, ["# Whiteboard 1", "", "A whiteboard to draw on."]);
await Deno.writeTextFile(`${topic}/whiteboard-01/board.excalidraw`, JSON.stringify({ type: "excalidraw", version: 2, source: "https://excalidraw.com", elements: [], appState: {}, files: {} }, null, 2) + "\n");

Deno.chdir(courseDir);
const [course, lr] = parseCourse(courseDir);
generateDynamicCourse(course, outDir);
copyAssets(lr, outDir);
process.stdout.write(`signed-in fixture course written to ${outDir}\n`);
