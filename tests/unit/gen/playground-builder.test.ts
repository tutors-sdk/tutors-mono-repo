import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseCourse } from "../../../packages/jsr/gen/src/tutors.ts";
import type { Lo, Playground, Topic } from "../../../packages/jsr/model/src/types/learning-objects.ts";

/**
 * What a `playground-*` folder becomes.
 *
 * The builder is not exported, so these drive it the way the CLI does: a real course
 * folder on disk, parsed end to end. That also keeps the test honest about the parts an
 * author actually touches — file names, and an optional `playground.yaml`.
 */

let scratch = "";

function write(file: string, contents: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function playground(name: string): Playground {
  const [course] = parseCourse(scratch, true);
  const topic = course.los.find((lo: Lo) => lo.type === "topic") as Topic;
  const found = topic.los.find((lo: Lo) => lo.type === "playground" && lo.route.endsWith(name));
  expect(found, `no playground ${name} in the parsed course`).toBeDefined();
  return found as Playground;
}

beforeAll(() => {
  scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-playground-"));
  write(path.join(scratch, "course.md"), "# Playground Course\n\nA course with playgrounds in it.\n");
  const topic = path.join(scratch, "topic-01-exercises");
  write(path.join(topic, "topic.md"), "# Exercises\n");

  // The minimum an author has to write: one file, no configuration.
  write(path.join(topic, "playground-01-hello", "main.py"), "print('hello')\n");

  // Names the defaults are meant to work out for themselves.
  const inferred = path.join(topic, "playground-02-inferred");
  write(path.join(inferred, "helper.py"), "def double(n):\n    return n * 2\n");
  write(path.join(inferred, "main.py"), "from helper import double\nprint(double(21))\n");
  write(path.join(inferred, "data.json"), '{ "answer": 42 }\n');
  write(path.join(inferred, "test_main.py"), "def test_double():\n    assert double(2) == 4\n");
  write(path.join(inferred, "notes.md"), "Not part of the workspace.\n");

  // Everything the yaml can override.
  const configured = path.join(topic, "playground-03-configured");
  write(path.join(configured, "exercise.ts"), "export const answer = 42;\n");
  write(path.join(configured, "scaffold.ts"), "export const given = 1;\n");
  write(path.join(configured, "checks.ts"), "console.log(answer);\n");
  write(
    path.join(configured, "playground.yaml"),
    ["runtime: typescript", "entry: exercise.ts", "tests: checks.ts", "packages:", "  - numpy", "readOnly:", "  - scaffold.ts", ""].join("\n")
  );

  // A file no student should have to download.
  const oversized = path.join(topic, "playground-04-oversized");
  write(path.join(oversized, "main.js"), "console.log(1);\n");
  write(path.join(oversized, "huge.js"), `// ${"x".repeat(300 * 1024)}\n`);

  // No runnable source at all.
  write(path.join(topic, "playground-05-empty", "readme.md"), "Nothing to run.\n");
});

afterAll(() => {
  if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
});

describe("playground builder: defaults", () => {
  it("builds a workspace from a folder holding a single source file", () => {
    const lo = playground("hello");
    expect(lo.type).toBe("playground");
    expect(lo.entry).toBe("main.py");
    expect(lo.runtime).toBe("python");
    expect(lo.files.map((file) => file.path)).toEqual(["main.py"]);
    expect(lo.files[0].content).toContain("print('hello')");
  });

  it("prefers main.* as the entry point and lists it first", () => {
    const lo = playground("inferred");
    expect(lo.entry).toBe("main.py");
    expect(lo.files[0].path).toBe("main.py");
  });

  it("infers the runtime from the entry point's extension", () => {
    expect(playground("inferred").runtime).toBe("python");
    expect(playground("oversized").runtime).toBe("javascript");
  });

  it("carries data files into the workspace alongside the source", () => {
    const paths = playground("inferred").files.map((file) => file.path);
    expect(paths).toContain("data.json");
  });

  it("leaves files that are neither source nor data out of the workspace", () => {
    const paths = playground("inferred").files.map((file) => file.path);
    expect(paths).not.toContain("notes.md");
  });

  it("keeps a test file out of the workspace and holds it separately", () => {
    const lo = playground("inferred");
    expect(lo.files.map((file) => file.path)).not.toContain("test_main.py");
    expect(lo.tests?.path).toBe("test_main.py");
    expect(lo.tests?.content).toContain("assert double(2) == 4");
  });

  it("marks nothing read-only unless asked to", () => {
    expect(playground("inferred").files.every((file) => file.readOnly === undefined)).toBe(true);
  });
});

describe("playground builder: playground.yaml", () => {
  it("takes the runtime, entry point and packages from the configuration", () => {
    const lo = playground("configured");
    expect(lo.runtime).toBe("typescript");
    expect(lo.entry).toBe("exercise.ts");
    expect(lo.packages).toEqual(["numpy"]);
  });

  it("marks the named files read-only and leaves the rest editable", () => {
    const lo = playground("configured");
    expect(lo.files.find((file) => file.path === "scaffold.ts")?.readOnly).toBe(true);
    expect(lo.files.find((file) => file.path === "exercise.ts")?.readOnly).toBeUndefined();
  });

  it("treats the named tests file as tests even though its name says nothing", () => {
    const lo = playground("configured");
    expect(lo.tests?.path).toBe("checks.ts");
    expect(lo.files.map((file) => file.path)).not.toContain("checks.ts");
  });
});

describe("playground builder: limits", () => {
  it("skips a file too large to inline, keeping the rest of the workspace", () => {
    const lo = playground("oversized");
    expect(lo.files.map((file) => file.path)).toEqual(["main.js"]);
  });

  it("builds an empty workspace rather than failing when there is nothing runnable", () => {
    const lo = playground("empty");
    expect(lo.files).toEqual([]);
  });
});
