import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { diskCourse } from "../../../packages/jsr/create/src/course-fs.ts";

it("diskCourse lists, reads, writes into new folders, moves, and never moves onto something that exists", async () => {
  const root = mkdtempSync(join(tmpdir(), "tutors-course-fs-"));
  writeFileSync(join(root, "course.md"), "# C");
  const fs = diskCourse(root);
  await fs.write("Week 3/topic.md", new TextEncoder().encode("# W"));
  expect((await fs.list("")).sort((a, b) => a.name.localeCompare(b.name))).toEqual([
    { name: "course.md", kind: "file", size: 3 },
    { name: "Week 3", kind: "dir" }
  ]);
  expect(new TextDecoder().decode(await fs.read("Week 3/topic.md"))).toBe("# W");
  await fs.move("Week 3", "unit-1/topic-week-3");
  expect(existsSync(join(root, "unit-1/topic-week-3/topic.md"))).toBe(true);
  expect(await fs.exists("Week 3")).toBe(false);
  await expect(fs.move("unit-1/topic-week-3/topic.md", "course.md")).rejects.toThrow("course.md already exists");
  expect(readFileSync(join(root, "course.md"), "utf-8")).toBe("# C");
});
