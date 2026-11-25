import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { defaultSpec, writeCourseToFilesystem } from "../src/scaffolder.ts";
import { runValidate } from "../src/validate-cli.ts";

async function validateFolder(dir: string, ...flags: string[]) {
  let out = "";
  const status = await runValidate([dir, ...flags], { out: (t) => (out += t), err: (t) => (out += t) });
  return { status, out };
}

Deno.test("validate - a generated course on disk checks out", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-validate-"));
  writeCourseToFilesystem({ ...defaultSpec, courseId: "web" }, parent);
  assertEquals(await validateFolder(path.join(parent, "web")), { status: 0, out: "Everything checks out.\n" });
  fs.rmSync(parent, { recursive: true });
});

Deno.test("validate - a planted Week 3 folder exits 1 and is named", async () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-validate-"));
  writeCourseToFilesystem({ ...defaultSpec, courseId: "web" }, parent);
  fs.mkdirSync(path.join(parent, "web", "Week 3"));
  fs.writeFileSync(path.join(parent, "web", "Week 3", "topic.md"), "# Week 3\n");
  const { status, out } = await validateFolder(path.join(parent, "web"), "--format", "json");
  assertEquals(status, 1);
  assertStringIncludes(out, '"path": "Week 3"');
  fs.rmSync(parent, { recursive: true });
});
