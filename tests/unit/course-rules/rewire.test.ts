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

const refused = (reason: string) => ({ ok: false, reason });
const nothing = { ok: true, ops: [], notes: [] };

describe("rewiring names", () => {
  it("keeps the name after the number, whatever way the number was written", async () => {
    const fs = course({ "topic-01/talk3-x/talk.md": "# A\n", "topic-01/talkintro/talk.md": "# B\n", "topic-01/talk-intro-2/talk.md": "# C\n" });
    const plan = await planReorder(fs, "topic-01", ["talk3-x", "talkintro", "talk-intro-2"]);
    await apply(fs, plan);
    expect(fs.paths().filter((path) => path.startsWith("topic-01/talk"))).toEqual([
      "topic-01/talk-01-x/talk.md",
      "topic-01/talk-02-intro/talk.md",
      "topic-01/talk-03-intro-2/talk.md"
    ]);
  });

  it("reads the longest kind a name starts with, so a notebook stays a notebook", async () => {
    const fs = course({ "topic-01/notebook-2-b/x.ipynb": "{}", "topic-01/notebook-1-a/x.ipynb": "{}" });
    await apply(fs, await planReorder(fs, "topic-01", ["notebook-2-b", "notebook-1-a"]));
    expect(fs.paths().filter((path) => path.startsWith("topic-01/notebook"))).toEqual(["topic-01/notebook-01-b/x.ipynb", "topic-01/notebook-02-a/x.ipynb"]);
  });

  it("renames through temporary names only what changes, and follows the ignore list only for renamed top-level folders", async () => {
    const fs = course({ "properties.yaml": "ignore:\n  - topic-02\n  - topic-09\n" });
    const plan = await planReorder(fs, "", ["topic-01", "topic-03", "topic-02"]);
    expect(plan).toEqual({
      ok: true,
      ops: [
        { op: "move", from: "topic-03", to: "topic-02.tutors-rewire" },
        { op: "move", from: "topic-02", to: "topic-03.tutors-rewire" },
        { op: "move", from: "topic-02.tutors-rewire", to: "topic-02" },
        { op: "move", from: "topic-03.tutors-rewire", to: "topic-03" },
        { op: "write", path: "properties.yaml", content: "ignore:\n  - topic-03\n  - topic-09\n", replace: true }
      ],
      notes: []
    });
    const untouched = course({ "properties.yaml": "ignore:\n  - topic-01\n" });
    expect(await planReorder(untouched, "", ["topic-01", "topic-03", "topic-02"])).toMatchObject({
      ok: true,
      ops: expect.not.arrayContaining([expect.objectContaining({ op: "write" })])
    });
  });

  it("follows no ignore list when it reorders inside a topic", async () => {
    const fs = course({ "properties.yaml": "ignore:\n  - talk-01-a\n", "topic-01/talk-01-a/talk.md": "# A\n", "topic-01/talk-02-b/talk.md": "# B\n" });
    const plan = await planReorder(fs, "topic-01", ["talk-02-b", "talk-01-a"]);
    expect(plan.ok && plan.ops.every((op) => op.op === "move")).toBe(true);
  });

  it("says why an order can't be used", async () => {
    const fs = course({ "topic-01/talk-01/talk.md": "# A\n", "topic-01/talk-02/talk.md": "# B\n", "topic-01/lab-01/01.a.md": "# L\n", "topic-01/code/x.py": "" });
    expect(await planReorder(fs, "topic-01", ["talk-02", "talk-09"])).toEqual(refused('There is nothing called "topic-01/talk-09" in the course to change.'));
    expect(await planReorder(fs, "topic-01", ["code", "talk-01"])).toEqual(refused('There is nothing called "topic-01/code" in the course to change.'));
    expect(await planReorder(fs, "topic-01", ["talk-02", "lab-01"])).toEqual(refused(expect.stringContaining("grouped by kind")));
    expect(await planReorder(fs, "topic-01", ["talk-02"])).toEqual(refused("Give every Talk in the folder, each once, in its new order."));
    expect(await planReorder(fs, "topic-09/x", ["talk-01"])).toEqual(refused('There is nothing called "topic-09/x" in the course to change.'));
  });

  it("names a link only from a page, not from other files", async () => {
    const fs = course({ "topic-01/talk-01/talk.md": "# A\n", "topic-01/talk-01/s.pdf": "topic-03 topic-02" });
    expect(await planReorder(fs, "", ["topic-03", "topic-01", "topic-02"])).toMatchObject({ ok: true, notes: [] });
    const linked = course({ "topic-01/note-01/note.md": "# N\n\n[next](../topic-02)\n" });
    expect(await planReorder(linked, "", ["topic-02", "topic-01", "topic-03"])).toMatchObject({ ok: true, notes: [expect.stringContaining('"topic-02"')] });
  });
});

describe("planMove refusals and edges", () => {
  const fs = () =>
    course({ "topic-01/talk-01/talk.md": "# A\n", "topic-01/talk-01/s.pdf": "%PDF", "topic-01/code/x.py": "", "unit-1/topic.md": "# U\n", "side-1/topic.md": "# S\n" });

  it("refuses what isn't an item, and where nothing can go", async () => {
    const course = fs();
    expect(await planMove(course, "", "topic-01")).toEqual(refused('There is nothing called "the course" in the course to change.'));
    expect(await planMove(course, "topic-01/code", "topic-02")).toEqual(refused('There is nothing called "topic-01/code" in the course to change.'));
    expect(await planMove(course, "topic-01/nope", "topic-02")).toEqual(refused('There is nothing called "topic-01/nope" in the course to change.'));
    expect(await planMove(course, "topic-01/talk-01", "topic-01/code")).toEqual(refused('There is nothing called "topic-01/code" in the course to change.'));
    expect(await planMove(course, "topic-01/talk-01", "topic-09/deep")).toEqual(refused('There is nothing called "topic-09/deep" in the course to change.'));
    expect(await planMove(course, "topic-01", "topic-01")).toEqual(refused("A folder can't be moved into itself or into a folder inside it."));
    expect(await planMove(course, "topic-01", "topic-01/talk-01")).toEqual(refused("A folder can't be moved into itself or into a folder inside it."));
    expect(await planMove(course, "unit-1", "side-1")).toEqual(refused("Tutors won't show a Unit inside a Side unit. A Unit can go at the top of the course."));
    expect(await planMove(course, "side-1", "unit-1")).toEqual(refused("Tutors won't show a Side unit inside a Unit. A Side unit can go at the top of the course."));
    expect(await planMove(course, "topic-02", "topic-01")).toEqual(
      refused("Tutors won't show a Topic inside a Topic. A Topic can go at the top of the course or in a Unit or in a Side unit.")
    );
  });

  it("changes nothing when the item is already there", async () => {
    expect(await planMove(fs(), "topic-01/talk-01", "topic-01")).toEqual(nothing);
    expect(await planMove(fs(), "topic-02", "")).toEqual(nothing);
  });

  it("keeps a hidden week hidden when it moves into a unit, and only then", async () => {
    const hidden = course({ "properties.yaml": "ignore:\n  - topic-03\n", "unit-1/topic.md": "# U\n" });
    expect(await planMove(hidden, "topic-03", "unit-1")).toEqual({
      ok: true,
      ops: [
        { op: "move", from: "topic-03", to: "unit-1/topic-01" },
        { op: "write", path: "properties.yaml", content: "ignore:\n  - topic-01\n", replace: true }
      ],
      notes: []
    });
    const deep = course({ "properties.yaml": "ignore:\n  - talk-01\n", "topic-01/talk-01/talk.md": "# A\n" });
    expect(await planMove(deep, "topic-01/talk-01", "topic-02")).toEqual({ ok: true, ops: [{ op: "move", from: "topic-01/talk-01", to: "topic-02/talk-01" }], notes: [] });
  });

  it("takes the first free number, whatever the other kinds there", async () => {
    const fs = course({ "topic-01/talk-01-a/talk.md": "# A\n", "topic-02/lab-01/01.a.md": "# L\n", "topic-02/talk1/talk.md": "# B\n" });
    expect(await planMove(fs, "topic-01/talk-01-a", "topic-02")).toMatchObject({ ok: true, ops: [{ op: "move", from: "topic-01/talk-01-a", to: "topic-02/talk-02-a" }] });
  });

  it("notes a page that links to the moved item", async () => {
    const fs = course({ "topic-01/talk-01/talk.md": "# A\n", "topic-02/note-01/note.md": "# N\n\nSee talk-01.\n" });
    expect(await planMove(fs, "topic-01/talk-01", "topic-03")).toMatchObject({ ok: true, notes: [expect.stringContaining('"talk-01"')] });
  });
});

describe("planRetitle edges", () => {
  it("refuses what isn't there, a folder of no kind, and a card with no page", async () => {
    const fs = course({ "topic-01/code/x.md": "# X\n", "topic-01/talk-01/s.pdf": "%PDF" });
    expect(await planRetitle(fs, "topic-01/nope", "New")).toEqual(refused('There is nothing called "topic-01/nope" in the course to change.'));
    expect(await planRetitle(fs, "topic-01/code", "New")).toEqual(refused('There is nothing called "topic-01/code" in the course to change.'));
    expect(await planRetitle(fs, "topic-01/talk-01", "New")).toEqual(refused("This Talk has no page to hold its title yet. Add its page first."));
    expect(await planRetitle(fs, "topic-01", "")).toEqual(refused("Give the new title at least one word."));
  });

  it("gives a one-line page a line ending, and keeps the rest of a longer one", async () => {
    const fs = course({ "topic-01/note-01/note.md": "# Old" });
    expect(await planRetitle(fs, "topic-01/note-01", "New")).toEqual({
      ok: true,
      ops: [{ op: "write", path: "topic-01/note-01/note.md", content: "# New\n", replace: true }],
      notes: []
    });
    expect(await planRetitle(fs, "topic-02", "Second week")).toEqual({
      ok: true,
      ops: [{ op: "write", path: "topic-02/topic.md", content: "# Second week\n", replace: true }],
      notes: []
    });
  });
});

describe("planHide edges", () => {
  it("refuses what isn't there, the course, a folder of no kind and an item inside a topic", async () => {
    const fs = course({ "code/x.py": "", "topic-01/talk-01/talk.md": "# A\n" });
    expect(await planHide(fs, "", true)).toEqual(refused('There is nothing called "the course" in the course to change.'));
    expect(await planHide(fs, "code", true)).toEqual(refused('There is nothing called "code" in the course to change.'));
    expect(await planHide(fs, "topic-09", true)).toEqual(refused('There is nothing called "topic-09" in the course to change.'));
    expect(await planHide(fs, "topic-01/talk-01", true)).toEqual(
      refused(
        "Tutors can hide only a whole topic or unit at the top of the course, not a Talk inside one. To keep it from students, remove it: it goes to the bin and can be put back."
      )
    );
  });

  it("changes nothing when the week is already as asked", async () => {
    const fs = course({ "properties.yaml": "ignore:\n  - topic-01\n" });
    expect(await planHide(fs, "topic-01", true)).toEqual(nothing);
    expect(await planHide(fs, "topic-02", false)).toEqual(nothing);
  });

  it("reads an ignore list however it was written, and keeps every other line", async () => {
    const cases: [string, string][] = [
      ["ignore : [topic-01]\ndontignore: yes\n", "dontignore: yes\nignore:\n  - topic-01\n  - topic-02\n"],
      ["ignore:\n- topic-01\ncredits: x\n", "credits: x\nignore:\n  - topic-01\n  - topic-02\n"],
      ["ignore:\n - topic-01\ncredits: x\n\n\n", "credits: x\nignore:\n  - topic-01\n  - topic-02\n"],
      ["ignore: topic-01\n", "ignore:\n  - topic-02\n"],
      ["just words\n", "just words\nignore:\n  - topic-02\n"],
      ["ignore: [\n", "ignore:\n  - topic-02\n"],
      ["", "ignore:\n  - topic-02\n"]
    ];
    for (const [before, after] of cases) {
      const fs = course({ "properties.yaml": before });
      expect(await planHide(fs, "topic-02", true)).toEqual({ ok: true, ops: [{ op: "write", path: "properties.yaml", content: after, replace: true }], notes: [] });
    }
  });
});

describe("planBin and planRestore edges", () => {
  it("refuses the course, the bin and anything in it, and what isn't there", async () => {
    const fs = course({ [`${BIN_FOLDER}/old/x.md`]: "# X\n" });
    expect(await planBin(fs, "")).toEqual(refused('There is nothing called "the course" in the course to change.'));
    expect(await planBin(fs, BIN_FOLDER)).toEqual(refused(`There is nothing called "${BIN_FOLDER}" in the course to change.`));
    expect(await planBin(fs, `${BIN_FOLDER}/old`)).toEqual(refused(`There is nothing called "${BIN_FOLDER}/old" in the course to change.`));
    expect(await planBin(fs, "topic-01/nope.pdf")).toEqual(refused('There is nothing called "topic-01/nope.pdf" in the course to change.'));
  });

  it("numbers a name the bin already has before a file's extension, never a folder's dot", async () => {
    const fs = course({
      [`${BIN_FOLDER}/a.pdf`]: "%PDF",
      [`${BIN_FOLDER}/a-2.pdf`]: "%PDF",
      [`${BIN_FOLDER}/talk-01.v2/talk.md`]: "# T\n",
      [`${BIN_FOLDER}/notes`]: "x",
      "topic-01/talk-01/a.pdf": "%PDF",
      "topic-01/talk-01.v2/talk.md": "# T\n",
      "topic-01/notes": "y"
    });
    expect(await planBin(fs, "topic-01/talk-01/a.pdf")).toMatchObject({ ok: true, ops: [{ op: "move", from: "topic-01/talk-01/a.pdf", to: `${BIN_FOLDER}/a-3.pdf` }] });
    expect(await planBin(fs, "topic-01/talk-01.v2")).toMatchObject({ ok: true, ops: [{ op: "move", from: "topic-01/talk-01.v2", to: `${BIN_FOLDER}/talk-01.v2-2` }] });
    expect(await planBin(fs, "topic-01/notes")).toMatchObject({ ok: true, ops: [{ op: "move", from: "topic-01/notes", to: `${BIN_FOLDER}/notes-2` }] });
  });

  it("takes only the binned week out of the ignore list, and only for a week", async () => {
    const fs = course({ "properties.yaml": "ignore:\n  - topic-01\n  - topic-02\n", "topic-01/talk-01/talk.md": "# A\n" });
    expect(await planBin(fs, "topic-01")).toMatchObject({
      ok: true,
      ops: [expect.anything(), { op: "write", path: "properties.yaml", content: "ignore:\n  - topic-02\n", replace: true }]
    });
    expect(await planBin(fs, "topic-03")).toEqual({ ok: true, ops: [{ op: "move", from: "topic-03", to: `${BIN_FOLDER}/topic-03` }], notes: [] });
    const nested = course({ "properties.yaml": "ignore:\n  - talk-01\n", "topic-01/talk-01/talk.md": "# A\n" });
    expect(await planBin(nested, "topic-01/talk-01")).toEqual({ ok: true, ops: [{ op: "move", from: "topic-01/talk-01", to: `${BIN_FOLDER}/talk-01` }], notes: [] });
  });

  it("notes a page that links to what goes to the bin", async () => {
    const fs = course({ "topic-01/talk-01/talk.md": "# A\n", "topic-02/note-01/note.md": "# N\n\nSee talk-01.\n" });
    expect(await planBin(fs, "topic-01/talk-01")).toMatchObject({ ok: true, notes: [expect.stringContaining('"talk-01"')] });
  });

  it("refuses to restore what the bin hasn't got, into a folder that can't hold it, or over a name in use", async () => {
    const fs = course({
      [`${BIN_FOLDER}/unit-1/topic.md`]: "# U\n",
      [`${BIN_FOLDER}/notes.txt`]: "x",
      [`${BIN_FOLDER}/old/x.txt`]: "x",
      "topic-01/notes.txt": "y",
      "topic-01/code/x.py": ""
    });
    expect(await planRestore(fs, "", "topic-01")).toEqual(refused('The bin holds nothing called "".'));
    expect(await planRestore(fs, "old/x.txt", "topic-01")).toEqual(refused('The bin holds nothing called "old/x.txt".'));
    expect(await planRestore(fs, "missing", "topic-01")).toEqual(refused('The bin holds nothing called "missing".'));
    expect(await planRestore(fs, "unit-1", "topic-09")).toEqual(refused('There is nothing called "topic-09" in the course to change.'));
    expect(await planRestore(fs, "unit-1", "topic-01/code")).toEqual(refused('There is nothing called "topic-01/code" in the course to change.'));
    expect(await planRestore(fs, "unit-1", "topic-01")).toEqual(refused("Tutors won't show a Unit inside a Topic. A Unit can go at the top of the course."));
    expect(await planRestore(fs, "notes.txt", "topic-01")).toEqual(
      refused('"topic-01/notes.txt" is already in the course, so the item can\'t go back under that name. Rename or move the one there first.')
    );
    expect(await planRestore(fs, "old", "topic-01")).toEqual({ ok: true, ops: [{ op: "move", from: `${BIN_FOLDER}/old`, to: "topic-01/old" }], notes: [] });
    expect(await planRestore(fs, `${BIN_FOLDER}/unit-1`, "")).toEqual({ ok: true, ops: [{ op: "move", from: `${BIN_FOLDER}/unit-1`, to: "unit-01" }], notes: [] });
  });

  it("refuses a folder of no kind over one of the same name", async () => {
    const fs = course({ [`${BIN_FOLDER}/code/x.py`]: "", "topic-01/code/y.py": "" });
    expect(await planRestore(fs, "code", "topic-01")).toEqual(
      refused('"topic-01/code" is already in the course, so the item can\'t go back under that name. Rename or move the one there first.')
    );
  });
});
