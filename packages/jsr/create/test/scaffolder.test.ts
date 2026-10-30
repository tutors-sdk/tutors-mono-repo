import { assertEquals, assert, assertThrows } from "jsr:@std/assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CourseDirectoryExistsError, generateCourseFiles, writeCourseToFilesystem, type CourseSpec } from "../src/scaffolder.ts";
import { runCli } from "../src/cli.ts";
import { LAB_STEP_COUNT, slugify } from "../src/types.ts";

const minimalSpec: CourseSpec = {
  courseName: "Test Course",
  lecturerName: "",
  courseId: "test-course",
  unitCount: 1,
  includeSide: false,
  topicsPerUnit: 1,
  includeNotes: false,
  includeLabs: false,
  includeCalendar: false,
  includeEnrollment: false,
  includeGitignore: false,
  includeReadme: false,
  readmeDescription: ""
};

Deno.test("generateCourseFiles - minimal spec produces course.md and properties.yaml", () => {
  const files = generateCourseFiles(minimalSpec);
  const paths = files.map((f) => f.relativePath);
  assert(paths.includes("course.md"));
  assert(paths.includes("properties.yaml"));
});

Deno.test("generateCourseFiles - creates units on the home page", () => {
  const spec: CourseSpec = { ...minimalSpec, unitCount: 3 };
  const files = generateCourseFiles(spec);
  const unitDirs = new Set(files.map((f) => f.relativePath.match(/^(unit-\d+)\//)?.[1]).filter((u): u is string => Boolean(u)));
  assertEquals(unitDirs.size, 3);
});

Deno.test("generateCourseFiles - each unit has a unit.md descriptor", () => {
  const spec: CourseSpec = { ...minimalSpec, unitCount: 3 };
  const files = generateCourseFiles(spec);
  const unitDescriptors = files.filter((f) => f.relativePath.match(/^unit-\d+\/unit\.md$/));
  assertEquals(unitDescriptors.length, 3);
});

Deno.test("generateCourseFiles - creates the requested topics per unit", () => {
  const spec: CourseSpec = { ...minimalSpec, unitCount: 2, topicsPerUnit: 3 };
  const files = generateCourseFiles(spec);
  const topicDescriptors = files.filter((f) => f.relativePath.match(/^unit-\d+\/topic-\d+\/topic-\d+\.md$/));
  // 2 units x 3 topics = 6 topic descriptors
  assertEquals(topicDescriptors.length, 6);
});

Deno.test("generateCourseFiles - every topic gets a talk with a Marp deck", () => {
  const spec: CourseSpec = { ...minimalSpec, unitCount: 2, topicsPerUnit: 2 };
  const files = generateCourseFiles(spec);
  const talkDescriptors = files.filter((f) => f.relativePath.match(/talk-\d+\/talk-\d+\.md$/));
  const marpDecks = files.filter((f) => f.relativePath.endsWith("/talk.marp"));
  // 2 units x 2 topics = 4 talks, each with a Marp deck
  assertEquals(talkDescriptors.length, 4);
  assertEquals(marpDecks.length, 4);
});

Deno.test("generateCourseFiles - includes a note per topic when enabled", () => {
  const spec: CourseSpec = { ...minimalSpec, unitCount: 2, topicsPerUnit: 2, includeNotes: true };
  const files = generateCourseFiles(spec);
  const noteFiles = files.filter((f) => f.relativePath.match(/unit-\d+\/topic-\d+\/note-\d+\/note-\d+\.md$/));
  assertEquals(noteFiles.length, 4);
});

Deno.test("generateCourseFiles - includes a lab with fixed steps per topic when enabled", () => {
  const spec: CourseSpec = { ...minimalSpec, unitCount: 1, topicsPerUnit: 2, includeLabs: true };
  const files = generateCourseFiles(spec);
  const labFiles = files.filter((f) => f.relativePath.includes("/book-lab-01/"));
  // 2 topics x (1 setup + LAB_STEP_COUNT steps)
  assertEquals(labFiles.length, 2 * (1 + LAB_STEP_COUNT));
});

Deno.test("generateCourseFiles - no notes or labs when disabled", () => {
  const spec: CourseSpec = { ...minimalSpec, unitCount: 2, topicsPerUnit: 2 };
  const files = generateCourseFiles(spec);
  assertEquals(files.filter((f) => f.relativePath.includes("/note-")).length, 0);
  assertEquals(files.filter((f) => f.relativePath.includes("book-lab-")).length, 0);
});

Deno.test("generateCourseFiles - side unit adds a talk and a note when enabled", () => {
  const spec: CourseSpec = { ...minimalSpec, includeSide: true };
  const files = generateCourseFiles(spec);
  const paths = files.map((f) => f.relativePath);
  assert(paths.includes("side/talk-01/talk-01.md"));
  assert(paths.includes("side/talk-01/talk.marp"));
  assert(paths.includes("side/note-01/note-01.md"));
});

Deno.test("generateCourseFiles - no side unit when disabled", () => {
  const files = generateCourseFiles(minimalSpec);
  assertEquals(files.filter((f) => f.relativePath.startsWith("side/")).length, 0);
});

Deno.test("generateCourseFiles - course.md contains course name", () => {
  const spec: CourseSpec = { ...minimalSpec, courseName: "Web Fundamentals" };
  const files = generateCourseFiles(spec);
  const courseMdFile = files.find((f) => f.relativePath === "course.md")!;
  assert(courseMdFile.content.includes("# Web Fundamentals"));
});

Deno.test("generateCourseFiles - course.md includes lecturer when provided", () => {
  const spec: CourseSpec = { ...minimalSpec, lecturerName: "Dr. Smith" };
  const files = generateCourseFiles(spec);
  const courseMdFile = files.find((f) => f.relativePath === "course.md")!;
  assert(courseMdFile.content.includes("Dr. Smith"));
});

Deno.test("course title is preserved verbatim while the folder uses the web-safe slug", () => {
  const courseName = "Web Dev 1: Foundations!";
  const courseId = slugify(courseName);
  // the folder name is the web-safe slug
  assertEquals(courseId, "web-dev-1-foundations");
  // course.md keeps the title exactly as typed (case and punctuation)
  const files = generateCourseFiles({ ...minimalSpec, courseName, courseId });
  const courseMdFile = files.find((f) => f.relativePath === "course.md")!;
  assert(courseMdFile.content.includes(`# ${courseName}`));
});

Deno.test("generateCourseFiles - learning objects carry an icon in frontmatter", () => {
  const spec: CourseSpec = { ...minimalSpec, includeSide: true, includeNotes: true, includeLabs: true };
  const files = generateCourseFiles(spec);
  const iconBearing = files.filter(
    (f) => f.relativePath.endsWith("topic-01.md") || f.relativePath.endsWith("talk-01.md") || f.relativePath.endsWith("note-01.md") || f.relativePath.endsWith("00.Setup.md")
  );
  assert(iconBearing.length > 0);
  for (const file of iconBearing) {
    assert(file.content.includes("icon:"), `${file.relativePath} should declare an icon`);
    assert(file.content.includes("fluent-color:"), `${file.relativePath} should use an Iconify icon`);
  }
});

Deno.test("generateCourseFiles - calendar.yaml only when enabled, seeded with weeks", () => {
  const off = generateCourseFiles({ ...minimalSpec, includeCalendar: false });
  assertEquals(off.filter((f) => f.relativePath === "calendar.yaml").length, 0);

  const on = generateCourseFiles({ ...minimalSpec, includeCalendar: true });
  const cal = on.find((f) => f.relativePath === "calendar.yaml")!;
  assert(cal);
  assert(cal.content.includes("weeks:"));
  // A worked 12-week example...
  assertEquals((cal.content.match(/week: \d+/g) ?? []).length, 12);
  // ...with a reading-week break after week 6...
  assert(cal.content.includes("Reading Week"));
  // ...and an assignment at week 6 and week 12.
  assertEquals((cal.content.match(/assessment:/g) ?? []).length, 2);
});

Deno.test("generateCourseFiles - enrollment.yaml only when enabled and fully commented", () => {
  const off = generateCourseFiles({ ...minimalSpec, includeEnrollment: false });
  assertEquals(off.filter((f) => f.relativePath === "enrollment.yaml").length, 0);

  const on = generateCourseFiles({ ...minimalSpec, includeEnrollment: true });
  const enr = on.find((f) => f.relativePath === "enrollment.yaml")!;
  assert(enr);
  // Every non-blank line is a comment, so the file is inert until edited.
  const nonComment = enr.content.split("\n").filter((line) => line.trim().length > 0 && !line.trim().startsWith("#"));
  assertEquals(nonComment, []);
});

Deno.test("generateCourseFiles - .gitignore only when enabled", () => {
  const off = generateCourseFiles({ ...minimalSpec, includeGitignore: false });
  assertEquals(off.filter((f) => f.relativePath === ".gitignore").length, 0);

  const on = generateCourseFiles({ ...minimalSpec, includeGitignore: true });
  assertEquals(on.filter((f) => f.relativePath === ".gitignore").length, 1);
});

Deno.test("generateCourseFiles - .gitignore covers the generated site and the usual cruft", () => {
  const files = generateCourseFiles({ ...minimalSpec, includeGitignore: true });
  const ignore = files.find((f) => f.relativePath === ".gitignore")!;
  const patterns = ignore.content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  // The generator's own output: ./json (tutors) and ./html (tutors-lite),
  // anchored so only the course root is matched.
  assert(patterns.includes("/json/"));
  assert(patterns.includes("/html/"));
  // The patterns called out in the original request, plus Node.
  for (const expected of ["~*", ".DS_Store", "_site/", ".netlify/", "node_modules/"]) {
    assert(patterns.includes(expected), `.gitignore should ignore ${expected}`);
  }
});

Deno.test("generateCourseFiles - README only when enabled, carrying the typed description", () => {
  const off = generateCourseFiles({ ...minimalSpec, includeReadme: false, readmeDescription: "Hidden" });
  assertEquals(off.filter((f) => f.relativePath === "README.md").length, 0);

  const on = generateCourseFiles({
    ...minimalSpec,
    courseName: "Web Fundamentals",
    includeReadme: true,
    readmeDescription: "An introduction to the modern web stack."
  });
  const readme = on.find((f) => f.relativePath === "README.md")!;
  assert(readme);
  assert(readme.content.startsWith("# Web Fundamentals"));
  assert(readme.content.includes("An introduction to the modern web stack."));
});

Deno.test("generateCourseFiles - README falls back to placeholder text and names the lecturer", () => {
  const files = generateCourseFiles({
    ...minimalSpec,
    lecturerName: "Dr. Smith",
    includeReadme: true,
    readmeDescription: "   "
  });
  const readme = files.find((f) => f.relativePath === "README.md")!;
  assert(readme.content.includes("A short description of this course goes here."));
  assert(readme.content.includes("Dr. Smith"));
});

Deno.test("generateCourseFiles - full spec generates expected structure", () => {
  const spec: CourseSpec = {
    courseName: "Full Course",
    lecturerName: "Prof. Test",
    courseId: "full-course",
    unitCount: 1,
    includeSide: true,
    topicsPerUnit: 2,
    includeNotes: true,
    includeLabs: true,
    includeCalendar: true,
    includeEnrollment: true,
    includeGitignore: true,
    includeReadme: true,
    readmeDescription: "A worked example course."
  };
  const files = generateCourseFiles(spec);
  const paths = files.map((f) => f.relativePath).sort();

  const labSteps = (topicDir: string) => [
    `${topicDir}/book-lab-01/00.Setup.md`,
    ...Array.from({ length: LAB_STEP_COUNT }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return `${topicDir}/book-lab-01/${n}.Step-${n}.md`;
    })
  ];

  const expected = [
    "course.md",
    "properties.yaml",
    "netlify.toml",
    "calendar.yaml",
    "enrollment.yaml",
    ".gitignore",
    "README.md",
    "side/side.md",
    "side/talk-01/talk-01.md",
    "side/talk-01/talk.marp",
    "side/note-01/note-01.md",
    "unit-1/unit.md",
    "unit-1/topic-01/topic-01.md",
    "unit-1/topic-01/talk-01/talk-01.md",
    "unit-1/topic-01/talk-01/talk.marp",
    "unit-1/topic-01/note-01/note-01.md",
    ...labSteps("unit-1/topic-01"),
    "unit-1/topic-02/topic-02.md",
    "unit-1/topic-02/talk-02/talk-02.md",
    "unit-1/topic-02/talk-02/talk.marp",
    "unit-1/topic-02/note-02/note-02.md",
    ...labSteps("unit-1/topic-02")
  ].sort();

  assertEquals(paths, expected);
});

Deno.test("slugify - converts name to URL-safe slug", () => {
  assertEquals(slugify("Web Development Fundamentals"), "web-development-fundamentals");
  assertEquals(slugify("  Spaces  Everywhere  "), "spaces-everywhere");
  assertEquals(slugify("Special! @Characters# Here"), "special-characters-here");
  assertEquals(slugify("Already-Slugged"), "already-slugged");
});

// --- writeCourseToFilesystem: never writes over an existing destination (#522) ---

function withTempDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-create-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Every file under a folder, relative to it, with its bytes.
function snapshot(dir: string): Record<string, string> {
  const entries = fs.readdirSync(dir, { recursive: true, withFileTypes: true }).filter((e) => e.isFile());
  return Object.fromEntries(
    entries.map((e) => {
      const full = path.join(e.parentPath, e.name);
      return [path.relative(dir, full), fs.readFileSync(full, "utf-8")];
    })
  );
}

Deno.test("writeCourseToFilesystem - writes the generated course into a fresh destination", () => {
  withTempDir((dir) => {
    const out = path.join(dir, "nested", "out");
    writeCourseToFilesystem(minimalSpec, out);
    const written = Object.keys(snapshot(path.join(out, minimalSpec.courseId))).sort();
    assertEquals(
      written,
      generateCourseFiles(minimalSpec)
        .map((f) => f.relativePath)
        .sort()
    );
  });
});

Deno.test("writeCourseToFilesystem - refuses an existing course and leaves it byte-for-byte unchanged", () => {
  withTempDir((dir) => {
    writeCourseToFilesystem(minimalSpec, dir);
    const courseDir = path.join(dir, minimalSpec.courseId);
    fs.writeFileSync(path.join(courseDir, "course.md"), "# Author text");
    fs.writeFileSync(path.join(courseDir, "unit-1", "topic-01", "topic-01.md"), "Author topic");
    const before = snapshot(courseDir);

    const error = assertThrows(() => writeCourseToFilesystem({ ...minimalSpec, includeReadme: true }, dir), CourseDirectoryExistsError);
    assertEquals(error.courseDir, courseDir);
    assertEquals(snapshot(courseDir), before);
  });
});

Deno.test("writeCourseToFilesystem - refuses a regular file at the destination", () => {
  withTempDir((dir) => {
    const dest = path.join(dir, minimalSpec.courseId);
    fs.writeFileSync(dest, "notes");
    assertThrows(() => writeCourseToFilesystem(minimalSpec, dir), CourseDirectoryExistsError);
    assertEquals(fs.readFileSync(dest, "utf-8"), "notes");
  });
});

Deno.test("writeCourseToFilesystem - refuses a symlink at the destination, live or dangling", () => {
  withTempDir((dir) => {
    const target = path.join(dir, "elsewhere");
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, "course.md"), "linked work");
    const dest = path.join(dir, minimalSpec.courseId);
    fs.symlinkSync(target, dest, "dir");
    assertThrows(() => writeCourseToFilesystem(minimalSpec, dir), CourseDirectoryExistsError);
    assertEquals(snapshot(target), { "course.md": "linked work" });

    fs.unlinkSync(dest);
    fs.symlinkSync(path.join(dir, "missing"), dest, "dir");
    assertThrows(() => writeCourseToFilesystem(minimalSpec, dir), CourseDirectoryExistsError);
    assert(!fs.existsSync(path.join(dir, "missing")));
  });
});

Deno.test("writeCourseToFilesystem - a destination claimed by a competing run is not written into", () => {
  withTempDir((dir) => {
    // The competing run has made the folder but not yet written its files.
    const dest = path.join(dir, minimalSpec.courseId);
    fs.mkdirSync(dest);
    assertThrows(() => writeCourseToFilesystem(minimalSpec, dir), CourseDirectoryExistsError);
    assertEquals(fs.readdirSync(dest), []);
  });
});

Deno.test("runCli - reports an existing destination, skips the next steps and exits unsuccessfully", () => {
  withTempDir((dir) => {
    writeCourseToFilesystem(minimalSpec, dir);
    const before = snapshot(path.join(dir, minimalSpec.courseId));
    let stdout = "";
    let stderr = "";
    const originalPrompt = globalThis.prompt;
    const originalOut = process.stdout.write;
    const originalErr = process.stderr.write;
    let asked = 0;
    globalThis.prompt = () => (asked++ === 0 ? minimalSpec.courseName : null);
    process.stdout.write = ((chunk: string) => ((stdout += chunk), true)) as typeof process.stdout.write;
    process.stderr.write = ((chunk: string) => ((stderr += chunk), true)) as typeof process.stderr.write;
    try {
      runCli(dir);
      assertEquals(process.exitCode, 1);
    } finally {
      globalThis.prompt = originalPrompt;
      process.stdout.write = originalOut;
      process.stderr.write = originalErr;
      process.exitCode = 0;
    }
    assert(stderr.includes(`${path.join(dir, minimalSpec.courseId)} already exists`), stderr);
    assert(!stdout.includes("Next steps:"), stdout);
    assertEquals(snapshot(path.join(dir, minimalSpec.courseId)), before);
  });
});
