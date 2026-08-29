import { assertEquals, assert } from "jsr:@std/assert";
import { generateCourseFiles, type CourseSpec } from "../src/scaffolder.ts";
import { slugify } from "../src/types.ts";

const minimalSpec: CourseSpec = {
  courseName: "Test Course",
  lecturerName: "",
  courseId: "test-course",
  topicCount: 1,
  labsPerTopic: 0,
  labStepCount: 3,
  includeTalks: false,
  includeNotes: false,
};

Deno.test("generateCourseFiles - minimal spec produces course.md and properties.yaml", () => {
  const files = generateCourseFiles(minimalSpec);
  const paths = files.map((f) => f.relativePath);
  assert(paths.includes("course.md"));
  assert(paths.includes("properties.yaml"));
});

Deno.test("generateCourseFiles - creates correct number of topics", () => {
  const spec: CourseSpec = { ...minimalSpec, topicCount: 3 };
  const files = generateCourseFiles(spec);
  const topicFiles = files.filter((f) => f.relativePath.match(/^topic-\d+\/topic-\d+\.md$/));
  assertEquals(topicFiles.length, 3);
});

Deno.test("generateCourseFiles - creates labs with correct step count", () => {
  const spec: CourseSpec = { ...minimalSpec, topicCount: 1, labsPerTopic: 2, labStepCount: 4 };
  const files = generateCourseFiles(spec);
  const labFiles = files.filter((f) => f.relativePath.includes("book-lab-"));
  // 2 labs x (1 setup + 3 steps) = 8 files
  assertEquals(labFiles.length, 8);
});

Deno.test("generateCourseFiles - includes talks when enabled", () => {
  const spec: CourseSpec = { ...minimalSpec, topicCount: 2, includeTalks: true };
  const files = generateCourseFiles(spec);
  const talkFiles = files.filter((f) => f.relativePath.includes("talk-"));
  assertEquals(talkFiles.length, 2);
});

Deno.test("generateCourseFiles - includes notes when enabled", () => {
  const spec: CourseSpec = { ...minimalSpec, topicCount: 2, includeNotes: true };
  const files = generateCourseFiles(spec);
  const noteFiles = files.filter((f) => f.relativePath.includes("note-"));
  assertEquals(noteFiles.length, 2);
});

Deno.test("generateCourseFiles - no talks or notes when disabled", () => {
  const files = generateCourseFiles(minimalSpec);
  const talkFiles = files.filter((f) => f.relativePath.includes("talk-"));
  const noteFiles = files.filter((f) => f.relativePath.includes("note-"));
  assertEquals(talkFiles.length, 0);
  assertEquals(noteFiles.length, 0);
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

Deno.test("generateCourseFiles - all files contain EDIT markers", () => {
  const spec: CourseSpec = {
    ...minimalSpec,
    topicCount: 1,
    labsPerTopic: 1,
    includeTalks: true,
    includeNotes: true,
  };
  const files = generateCourseFiles(spec);
  const mdFiles = files.filter((f) => f.relativePath.endsWith(".md"));
  for (const file of mdFiles) {
    assert(file.content.includes("EDIT:"), `${file.relativePath} should contain EDIT markers`);
  }
});

Deno.test("generateCourseFiles - full spec generates expected structure", () => {
  const spec: CourseSpec = {
    courseName: "Full Course",
    lecturerName: "Prof. Test",
    courseId: "full-course",
    topicCount: 2,
    labsPerTopic: 1,
    labStepCount: 3,
    includeTalks: true,
    includeNotes: true,
  };
  const files = generateCourseFiles(spec);
  const paths = files.map((f) => f.relativePath).sort();

  const expected = [
    "course.md",
    "properties.yaml",
    "topic-01/topic-01.md",
    "topic-01/book-lab-01/00.Setup.md",
    "topic-01/book-lab-01/01.Step-01.md",
    "topic-01/book-lab-01/02.Step-02.md",
    "topic-01/talk-01/talk-01.md",
    "topic-01/note-01/note-01.md",
    "topic-02/topic-02.md",
    "topic-02/book-lab-01/00.Setup.md",
    "topic-02/book-lab-01/01.Step-01.md",
    "topic-02/book-lab-01/02.Step-02.md",
    "topic-02/talk-02/talk-02.md",
    "topic-02/note-02/note-02.md",
  ].sort();

  assertEquals(paths, expected);
});

Deno.test("slugify - converts name to URL-safe slug", () => {
  assertEquals(slugify("Web Development Fundamentals"), "web-development-fundamentals");
  assertEquals(slugify("  Spaces  Everywhere  "), "spaces-everywhere");
  assertEquals(slugify("Special! @Characters# Here"), "special-characters-here");
  assertEquals(slugify("Already-Slugged"), "already-slugged");
});
