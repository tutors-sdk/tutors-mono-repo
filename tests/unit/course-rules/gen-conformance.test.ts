import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { parseCourse, readCourseTree, type CourseTree } from "../../../packages/jsr/gen/src/tutors.ts";
import { MemoryFileSystem, validate } from "../../../packages/jsr/course-rules/src/mod.ts";
import { VALIDATE_RULES, validateFixture } from "../../support/validate-fixtures.ts";
import { imageTypes, type Lo } from "../../../packages/jsr/model/src/tutors.ts";
import { isMarpContent } from "../../../packages/jsr/gen/src/services/marp-renderer.ts";

/**
 * The validator's truth source is the generator: V002 must name exactly the folders gen leaves out of a
 * course (and that hold more than images, which gen still copies as assets). Each fixture course is
 * written to disk, built by gen, and the folders gen dropped are compared with the V002 findings.
 */
const roots: string[] = [];
afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function onDisk(files: Record<string, string>): string {
  const root = join(mkdtempSync(join(tmpdir(), "tutors-validate-")), "course").replaceAll("\\", "/");
  roots.push(dirname(root));
  mkdirSync(root, { recursive: true });
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

const onlyImages = (tree: CourseTree): boolean =>
  tree.files.every((file) => imageTypes.includes(file.slice(file.lastIndexOf(".") + 1).toLowerCase())) && tree.lrs.every(onlyImages);

/** Top-most folders under the root that the generator built no learning object for, and which hold more than images. */
function droppedByGen(root: string): string[] {
  const tree = readCourseTree(root);
  const [course] = parseCourse(root, true);
  const dropped: string[] = [];
  const visit = (folder: CourseTree, lo: Lo) => {
    const built = new Map(((lo as { los?: Lo[] }).los ?? []).map((child) => [child.id, child]));
    for (const child of folder.lrs) {
      const childLo = built.get(child.id);
      if (childLo) visit(child, childLo);
      else if (!onlyImages(child)) dropped.push(child.route.slice(root.length + 1));
    }
  };
  visit(tree, course);
  return dropped.sort();
}

describe("V002 conforms to the generator", () => {
  // gen refuses a broken YAML file outright, which V006 reports; there is no pruned set to compare there.
  const cases = VALIDATE_RULES.flatMap((rule) => (["broken", "fixed"] as const).map((form) => ({ rule, form }))).filter(
    ({ rule, form }) => !(rule === "V006" && form === "broken")
  );

  it.each(cases)("$rule $form: the V002 findings are the folders gen leaves out", async ({ rule, form }) => {
    const files = validateFixture(rule, form);
    const v002 = (await validate(new MemoryFileSystem(files)))
      .filter((f) => f.rule === "V002")
      .map((f) => f.path)
      .sort();
    expect(v002).toEqual(droppedByGen(onDisk(files)));
  });

  it("the V002 fixture really does lose content in gen", () => {
    expect(droppedByGen(onDisk(validateFixture("V002", "broken")))).toEqual(["Week 3", "topic-01/Slides", "unit-1/Lab1"]);
  });
});

describe("V015 conforms to the generator", () => {
  /** Whether gen builds the fixture's talk as Marp slides, read with gen's own Marp test. */
  const talkIsMarp = (files: Record<string, string>): boolean => {
    const [course] = parseCourse(onDisk(files), true);
    const talk = (course.los as Lo[]).flatMap((topic) => (topic as { los?: Lo[] }).los ?? []).find((lo) => lo.type === "talk")!;
    return isMarpContent(talk);
  };

  it("gen shows the deck as slides exactly when V015 is silent", async () => {
    for (const form of ["broken", "fixed"] as const) {
      const files = validateFixture("V015", form);
      const v015 = (await validate(new MemoryFileSystem(files))).some((f) => f.rule === "V015");
      expect(talkIsMarp(files)).toBe(!v015);
    }
  });

  it("marp: true in the talk's .md counts, as gen merges its front matter", async () => {
    const files = { ...validateFixture("V015", "broken"), "topic-01/talk-01/talk.md": "---\nmarp: true\n---\n# Introducing HTML\n" };
    expect((await validate(new MemoryFileSystem(files))).some((f) => f.rule === "V015")).toBe(false);
    expect(talkIsMarp(files)).toBe(true);
  });
});
