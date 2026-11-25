import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { generateStaticCourse, parseCourse } from "@tutors/tutors-gen-lib";
import { runTutorsLite } from "../src/run.ts";

// Issue #529: the exit status of tutors-lite is what CI and publishing scripts read,
// so a failed or missing-input build must not exit 0.

const here = path.dirname(fileURLToPath(import.meta.url));
const mainTs = path.resolve(here, "../main.ts");
const workspaceConfig = path.resolve(here, "../../../../deno.json");
const ventoFolder = path.resolve(here, "../../gen/src/templates/vento");
// A 1x1 PNG: enough for copyAssets to have something to copy.
const png = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

function tempCourse(withCourseMd = true): string {
  const root = Deno.makeTempDirSync({ prefix: "tutors-lite-" });
  if (withCourseMd) {
    fs.writeFileSync(path.join(root, "course.md"), "# Course\nA course\n");
    fs.writeFileSync(path.join(root, "course.png"), png);
    fs.mkdirSync(path.join(root, "topic-01"));
    fs.writeFileSync(path.join(root, "topic-01/topic.md"), "# Topic 1\nA topic\n");
    fs.writeFileSync(path.join(root, "topic-01/topic.png"), png);
  }
  return root;
}

async function runCli(cwd: string): Promise<{ code: number; stderr: string }> {
  const output = await new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--config", workspaceConfig, mainTs],
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).output();
  return { code: output.code, stderr: new TextDecoder().decode(output.stderr) };
}

Deno.test("tutors-lite: a folder with no course.md exits nonzero with a diagnostic", async () => {
  const root = tempCourse(false);
  try {
    const { code, stderr } = await runCli(root);
    assert(code !== 0, `expected a nonzero exit, got ${code}`);
    assertStringIncludes(stderr, "Cannot locate course.md");
    assert(!fs.existsSync(path.join(root, "html")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

Deno.test("tutors-lite: a valid course generates html, copies assets and exits zero", async () => {
  const root = tempCourse();
  try {
    const { code, stderr } = await runCli(root);
    assertEquals(code, 0, stderr);
    assert(fs.existsSync(path.join(root, "html/index.html")));
    assert(fs.existsSync(path.join(root, "html/topic-01/index.html")));
    assert(fs.existsSync(path.join(root, "html/topic-01/topic.png")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

Deno.test("tutors-lite: a false generator result returns a nonzero exit code and skips copyAssets", async () => {
  const root = tempCourse();
  let copied = false;
  try {
    const code = await runTutorsLite(root, ventoFolder, {
      parseCourse,
      generateStaticCourse: () => Promise.resolve(false),
      copyAssets: () => {
        copied = true;
      },
    });
    assertEquals(code, 1);
    assertEquals(copied, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

Deno.test("tutors-lite: a template that fails to render returns a nonzero exit code and copies no assets", async () => {
  const root = tempCourse();
  const brokenVento = Deno.makeTempDirSync({ prefix: "tutors-lite-vento-" });
  try {
    fs.cpSync(ventoFolder, brokenVento, { recursive: true });
    // Reading a property of undefined: rendering the course home page throws.
    fs.writeFileSync(path.join(brokenVento, "Composite.vto"), "<h1>{{ it.lo.missing.title }}</h1>\n");
    let copied = false;
    const code = await runTutorsLite(root, brokenVento, {
      parseCourse,
      generateStaticCourse,
      copyAssets: () => {
        copied = true;
      },
    });
    assertEquals(code, 1);
    assertEquals(copied, false);
    assert(!fs.existsSync(path.join(root, "html/topic-01/topic.png")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(brokenVento, { recursive: true, force: true });
  }
});
