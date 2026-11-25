import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ArchiveError } from "../../../packages/jsr/create/src/archive.ts";
import { runImport, unpackToFolder, writeImport } from "../../../packages/jsr/create/src/import-cli.ts";
import { CourseDirectoryExistsError } from "../../../packages/jsr/create/src/scaffolder.ts";
import { moodleBackup } from "../../support/course-archives.ts";

/** tutors import's file handling, below the scenarios in course-archive-import.feature (issue #611). */
const made: string[] = [];
const scratch = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-import-cli-test-"));
  made.push(dir);
  return dir;
};
const unpacked = () =>
  fs
    .readdirSync(os.tmpdir())
    .filter((name) => name.startsWith("tutors-unpacked-"))
    .sort();
afterEach(() => {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const backup = moodleBackup([
  { title: "", things: [] },
  { title: "Intro", things: [{ folder: "Lab 1", files: [{ name: "01 Setup.md", content: "# Setup", path: "/steps/" }] }] }
]);

describe("unpacking a course export", () => {
  it("writes each file of the export, in its folders, into a new temporary folder", () => {
    const file = path.join(scratch(), "web.mbz");
    fs.writeFileSync(file, backup);
    const folder = unpackToFolder(file);
    made.push(folder);
    expect(path.basename(folder)).toMatch(/^tutors-unpacked-/);
    expect(fs.readFileSync(path.join(folder, "Week 01 Intro/Lab 1/steps/01 Setup.md"), "utf-8")).toBe("# Setup");
  });

  it("refuses a file that isn't a course export, by name", () => {
    expect(() => unpackToFolder("notes.zip")).toThrow(new ArchiveError("notes.zip isn't a Moodle backup (.mbz) or a Common Cartridge (.imscc)."));
  });
});

describe("tutors import", () => {
  it("removes the unpacked folder once the course is written", async () => {
    const dir = scratch();
    const file = path.join(dir, "web.mbz");
    fs.writeFileSync(file, backup);
    const before = unpacked();
    const io = { out: () => {}, err: () => {} };
    await runImport([file, "--name", "Web", "--out", dir], io);
    expect(unpacked()).toEqual(before);
    expect(fs.existsSync(path.join(dir, "web"))).toBe(true);
  });

  it("says what is wrong with its arguments", async () => {
    const errors: string[] = [];
    expect(await runImport([], { out: () => {}, err: (text) => errors.push(text) })).toBe(1);
    expect(errors).toHaveLength(1);
  });

  it("never writes into a course folder that already exists", () => {
    const dir = scratch();
    expect(() => writeImport({ files: [], copies: [] } as never, dir, dir)).toThrow(CourseDirectoryExistsError);
  });
});
