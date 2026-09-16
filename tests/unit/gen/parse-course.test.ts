import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Composite, Lab, Lo } from "../../../packages/jsr/model/src/tutors.ts";
import { parseCourse } from "../../../packages/jsr/gen/src/tutors.ts";

/** parseCourse over a real course folder on disk, as the tutors and tutors-lite CLIs run it. */

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function writeCourse(parent: string, files: Record<string, string>): string {
  const scratch = mkdtempSync(join(tmpdir(), "tutors-parse-"));
  roots.push(scratch);
  const root = join(scratch, parent).replaceAll("\\", "/");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function find(lo: Lo, id: string): Lo {
  if (lo.id === id) return lo;
  for (const child of (lo as Composite).los ?? []) {
    try {
      return find(child, id);
    } catch {
      /* keep looking */
    }
  }
  throw new Error(`no lo with id ${id}`);
}

const labCourse = {
  "course.md": "# Course\nA course\n",
  "topic-01/topic.md": "# Topic 1\nA topic\n",
  "topic-01/book-a/01.Setup.md": "# Setup\nInstall things\n",
  "topic-01/book-a/02.Step-01.md": "# Step 1\nDo things\n"
};

describe("parseCourse: lab step ids", () => {
  it.each(["course", ".claude/worktrees/agent-1/course", "my.courses/v1.2", ".cache/tutors.course"])("derives step ids from the file name under %s", (parent) => {
    const [course] = parseCourse(writeCourse(parent, labCourse), true);
    const lab = find(course, "book-a") as Lab;
    expect(lab.los.map((step) => step.id)).toEqual(["Setup", "Step-01"]);
    expect(lab.los.map((step) => (step as Lo & { shortTitle: string }).shortTitle)).toEqual(["Setup", "Step-01"]);
    expect(lab.los.map((step) => step.route)).toEqual(["/lab/{{COURSEURL}}/topic-01/book-a/Setup", "/lab/{{COURSEURL}}/topic-01/book-a/Step-01"]);
  });
});

describe("parseCourse: titles", () => {
  it.each([
    ["LF", "\n"],
    ["CRLF", "\r\n"]
  ])("reads titles without the space after # or a trailing carriage return (%s)", (_, eol) => {
    const md = (title: string, heading = "#") => `${heading} ${title}${eol}A summary${eol}`;
    const root = writeCourse("course", {
      "course.md": md("Course"),
      "topic-01/topic.md": md("Topic 1"),
      "topic-01/note-1/note.md": md("Note 1"),
      "topic-01/book-a/01.Setup.md": md("Lab 1", "##")
    });
    const [course] = parseCourse(root, true);
    expect(course.title).toBe("Course");
    expect(find(course, "topic-01").title).toBe("Topic 1");
    expect(find(course, "note-1").title).toBe("Note 1");
    expect((find(course, "book-a") as Lab).los[0].title).toBe("Lab 1");
  });
});

describe("tutors-lite templates", () => {
  it("Note.vto renders nothing after the note card", () => {
    const template = readFileSync(join(__dirname, "../../../packages/jsr/gen/src/templates/vento/Note.vto"), "utf8");
    expect(template).toMatch(/\{\{ noteCard\(lo\) \}\}\r?\n/);
  });
});
