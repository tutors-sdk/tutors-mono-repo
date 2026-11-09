import { describe, expect, it } from "vitest";
import {
  applyFixes,
  BIN_FOLDER,
  MemoryFileSystem,
  planBin,
  planHide,
  planMove,
  planReorder,
  planRestore,
  planRetitle,
  validate
} from "../../../packages/jsr/course-rules/src/mod.ts";
import { parseValidateArgs } from "../../../packages/jsr/create/src/validate-cli.ts";

const course = (extra: Record<string, string> = {}) =>
  new MemoryFileSystem({
    "course.md": "# Web\n",
    "netlify.toml": '[build]\n  publish = "json"\n',
    "topic-01/topic.md": "# Week 1\n",
    "topic-02/topic.md": "# Week 2\n",
    "topic-03/topic.md": "# Week 3\n",
    ...extra
  });
const apply = async (fs: MemoryFileSystem, plan: Awaited<ReturnType<typeof planReorder>>) => {
  if (!plan.ok) throw new Error(plan.reason);
  const outcome = await applyFixes(fs, "", plan.ops);
  expect(outcome.skipped).toEqual([]);
};
const topLevel = (fs: MemoryFileSystem) => [
  ...new Set(
    fs
      .paths()
      .map((path) => path.split("/")[0])
      .filter((name) => name.startsWith("topic"))
  )
];

describe("planReorder", () => {
  it("swaps weeks with no name after their number through temporary names", async () => {
    const fs = course();
    await apply(fs, await planReorder(fs, "", ["topic-03", "topic-01", "topic-02"]));
    expect(topLevel(fs).sort()).toEqual(["topic-01", "topic-02", "topic-03"]);
    expect(new TextDecoder().decode(await fs.read("topic-01/topic.md"))).toBe("# Week 3\n");
    expect(new TextDecoder().decode(await fs.read("topic-02/topic.md"))).toBe("# Week 1\n");
  });

  it("keeps a hidden week hidden under its new name", async () => {
    const fs = course({ "properties.yaml": "credits: Leigh\nignore:\n  - topic-03\n" });
    await apply(fs, await planReorder(fs, "", ["topic-03", "topic-01", "topic-02"]));
    expect(new TextDecoder().decode(await fs.read("properties.yaml"))).toBe("credits: Leigh\nignore:\n  - topic-01\n");
  });

  it("refuses an order that leaves an item out or names one twice", async () => {
    const fs = course();
    expect(await planReorder(fs, "", ["topic-02", "topic-01"])).toMatchObject({ ok: false });
    expect(await planReorder(fs, "", ["topic-02", "topic-02", "topic-01"])).toMatchObject({ ok: false });
    expect(await planReorder(fs, "topic-09", ["talk-01"])).toMatchObject({ ok: false });
  });

  it("notes a link a page makes to a folder it renames", async () => {
    const fs = course({ "topic-01/note-01/note.md": "# See\n\nSee [week 3](../../topic-03).\n" });
    const plan = await planReorder(fs, "", ["topic-03", "topic-01", "topic-02"]);
    expect(plan.ok && plan.notes).toEqual([expect.stringContaining('"topic-03"')]);
  });
});

describe("planMove", () => {
  it("gives a moved item the next free number of its kind and keeps its name", async () => {
    const fs = course({ "topic-01/lab-02-css/01.start.md": "# CSS\n", "topic-02/lab-01-html/01.start.md": "# HTML\n" });
    await apply(fs, await planMove(fs, "topic-01/lab-02-css", "topic-02"));
    expect(fs.paths()).toContain("topic-02/lab-02-css/01.start.md");
    expect((await validate(fs)).filter((finding) => finding.severity === "error")).toEqual([]);
  });

  it("refuses a move into the item itself, and a week into a talk", async () => {
    const fs = course({ "topic-01/talk-01/talk.md": "# T\n", "topic-01/talk-01/s.pdf": "%PDF" });
    expect(await planMove(fs, "topic-01", "topic-01/talk-01")).toMatchObject({ ok: false });
    expect(await planMove(fs, "topic-02", "topic-01/talk-01")).toMatchObject({ ok: false, reason: expect.stringContaining("Tutors won't show a Topic inside a Talk") });
  });

  it("lets a week go into a unit", async () => {
    const fs = course({ "unit-1/topic.md": "# Unit\n" });
    await apply(fs, await planMove(fs, "topic-03", "unit-1"));
    expect(fs.paths()).toContain("unit-1/topic-01/topic.md");
  });
});

describe("planRetitle", () => {
  it("writes a heading where the first line had none, and refuses an empty title", async () => {
    const fs = course({ "topic-01/note-01/note.md": "Plain first line\n\nBody\n" });
    await apply(fs, await planRetitle(fs, "topic-01/note-01", "  Reading   list "));
    expect(new TextDecoder().decode(await fs.read("topic-01/note-01/note.md"))).toBe("# Reading list\n\nBody\n");
    expect(await planRetitle(fs, "topic-01/note-01", " ")).toMatchObject({ ok: false });
  });

  it("retitles a lab through its first step", async () => {
    const fs = course({ "topic-01/lab-01/01.setup.md": "# Setup\n\nStep one.\n", "topic-01/lab-01/02.more.md": "# More\n" });
    await apply(fs, await planRetitle(fs, "topic-01/lab-01", "Getting started"));
    expect(new TextDecoder().decode(await fs.read("topic-01/lab-01/01.setup.md"))).toBe("# Getting started\n\nStep one.\n");
  });
});

describe("planHide", () => {
  it("adds and removes a week from an ignore list written inline", async () => {
    const fs = course({ "properties.yaml": "credits: Leigh\nignore: [topic-01]\nfavicon: x.png\n" });
    await apply(fs, await planHide(fs, "topic-02", true));
    expect(new TextDecoder().decode(await fs.read("properties.yaml"))).toBe("credits: Leigh\nfavicon: x.png\nignore:\n  - topic-01\n  - topic-02\n");
    await apply(fs, await planHide(fs, "topic-01", false));
    await apply(fs, await planHide(fs, "topic-02", false));
    expect(new TextDecoder().decode(await fs.read("properties.yaml"))).toBe("credits: Leigh\nfavicon: x.png\n");
    expect((await validate(fs)).filter((finding) => finding.rule === "V006")).toEqual([]);
  });

  it("writes properties.yaml when there is none", async () => {
    const fs = course();
    await apply(fs, await planHide(fs, "topic-01", true));
    expect(new TextDecoder().decode(await fs.read("properties.yaml"))).toBe("ignore:\n  - topic-01\n");
  });
});

describe("planBin and planRestore", () => {
  it("bins two items of the same name side by side, and a single file", async () => {
    const fs = course({ "topic-01/talk-01/talk.md": "# A\n", "topic-01/talk-01/a.pdf": "%PDF", "topic-02/talk-01/talk.md": "# B\n", "topic-02/talk-01/b.pdf": "%PDF" });
    await apply(fs, await planBin(fs, "topic-01/talk-01"));
    await apply(fs, await planBin(fs, "topic-02/talk-01"));
    await apply(fs, await planBin(fs, "course.md"));
    expect(fs.paths().filter((path) => path.startsWith(BIN_FOLDER))).toEqual([
      `${BIN_FOLDER}/course.md`,
      `${BIN_FOLDER}/talk-01-2/b.pdf`,
      `${BIN_FOLDER}/talk-01-2/talk.md`,
      `${BIN_FOLDER}/talk-01/a.pdf`,
      `${BIN_FOLDER}/talk-01/talk.md`
    ]);
    expect(await planBin(fs, BIN_FOLDER)).toMatchObject({ ok: false });
  });

  it("takes a binned week out of the ignore list, and puts an item back with the next free number", async () => {
    const fs = course({ "properties.yaml": "ignore:\n  - topic-02\n", "topic-01/talk-01/talk.md": "# A\n", "topic-01/talk-01/a.pdf": "%PDF" });
    await apply(fs, await planBin(fs, "topic-02"));
    expect(new TextDecoder().decode(await fs.read("properties.yaml"))).toBe("");
    await apply(fs, await planBin(fs, "topic-01/talk-01"));
    await apply(fs, await planRestore(fs, `${BIN_FOLDER}/talk-01`, "topic-03"));
    expect(fs.paths()).toContain("topic-03/talk-01/talk.md");
    expect(await planRestore(fs, "talk-09", "topic-01")).toMatchObject({ ok: false });
  });
});

describe("tutors validate --plan", () => {
  it("can't be asked to plan and apply at once", () => {
    expect(parseValidateArgs(["--plan"])).toMatchObject({ plan: true, fix: false });
    expect(parseValidateArgs(["--plan", "--fix"])).toEqual(expect.stringContaining("not both"));
  });
});
