import { assertEquals, assert } from "jsr:@std/assert";
import { generateCourseFiles, type CourseSpec } from "../src/scaffolder.ts";
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
  const unitDirs = new Set(
    files
      .map((f) => f.relativePath.match(/^(unit-\d+)\//)?.[1])
      .filter((u): u is string => Boolean(u)),
  );
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
  const iconBearing = files.filter((f) =>
    f.relativePath.endsWith("topic-01.md") ||
    f.relativePath.endsWith("talk-01.md") ||
    f.relativePath.endsWith("note-01.md") ||
    f.relativePath.endsWith("00.Setup.md")
  );
  assert(iconBearing.length > 0);
  for (const file of iconBearing) {
    assert(file.content.includes("icon:"), `${file.relativePath} should declare an icon`);
    assert(file.content.includes("fluent-color:"), `${file.relativePath} should use an Iconify icon`);
  }
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
  };
  const files = generateCourseFiles(spec);
  const paths = files.map((f) => f.relativePath).sort();

  const labSteps = (topicDir: string) => [
    `${topicDir}/book-lab-01/00.Setup.md`,
    ...Array.from({ length: LAB_STEP_COUNT }, (_, i) => {
      const n = String(i + 1).padStart(2, "0");
      return `${topicDir}/book-lab-01/${n}.Step-${n}.md`;
    }),
  ];

  const expected = [
    "course.md",
    "properties.yaml",
    "netlify.toml",
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
    ...labSteps("unit-1/topic-02"),
  ].sort();

  assertEquals(paths, expected);
});

Deno.test("slugify - converts name to URL-safe slug", () => {
  assertEquals(slugify("Web Development Fundamentals"), "web-development-fundamentals");
  assertEquals(slugify("  Spaces  Everywhere  "), "spaces-everywhere");
  assertEquals(slugify("Special! @Characters# Here"), "special-characters-here");
  assertEquals(slugify("Already-Slugged"), "already-slugged");
});
