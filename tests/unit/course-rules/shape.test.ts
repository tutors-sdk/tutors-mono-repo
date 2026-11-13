import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { linkOf, MemoryFileSystem, proposeShape, validate, weekOf, type ShapeProposal } from "../../../packages/jsr/course-rules/src/mod.ts";
import { importLayout } from "../../../packages/jsr/create/src/import-course.ts";
import { importSummary, parseImportArgs, readImportFolder, runImport } from "../../../packages/jsr/create/src/import-cli.ts";
import { defaultSpec, type CourseSpec } from "../../../packages/jsr/create/src/types.ts";
import { importCorpus } from "../../support/import-corpus.ts";

describe("weekOf", () => {
  it.each([
    ["Week01.pdf", 1],
    ["week 12 - review.pdf", 12],
    ["WK3.pdf", 3],
    ["w4 functions.pdf", 4],
    ["Lecture_5.pdf", 5],
    ["lect6.pdf", 6],
    ["Lec-7.pdf", 7],
    ["L8 Trees.pdf", 8],
    ["Topic-9.pdf", 9],
    ["Session 10.pdf", 10],
    ["class.11.pdf", 11],
    ["07 Graphs.pdf", 7],
    ["3.pdf", 3],
    ["004 Sorting.pdf", 4],
    ["CS101 Lecture 2.pdf", 2],
    ["Week 52.pdf", 52]
  ])("%s is week %d", (name, week) => expect(weekOf(name)).toBe(week));

  it.each(["slides.pdf", "Lab1.pdf", "Week 0.pdf", "Week 53.pdf", "2024 exam.pdf", "Week 123.pdf", "html5.pdf", "Intro.pdf", "100 Days.pdf", "Lecture notes.pdf", "Week.pdf"])(
    "%s names no week",
    (name) => expect(weekOf(name)).toBeNull()
  );
});

describe("linkOf", () => {
  it("reads .url, .webloc and .txt links and nothing else", () => {
    expect(linkOf({ path: "a.url", text: "[InternetShortcut]\nURL=https://a.org/x \n" })).toBe("https://a.org/x");
    expect(linkOf({ path: "a.webloc", text: "<plist><string>http://b.org</string></plist>" })).toBe("http://b.org");
    expect(linkOf({ path: "a.TXT", text: "https://c.org\r\nsecond line" })).toBe("https://c.org");
    expect(linkOf({ path: "a.txt", text: "see https://c.org" })).toBeNull();
    expect(linkOf({ path: "a.txt", text: "https://c.org/has space" })).toBeNull();
    expect(linkOf({ path: "a.url", text: "[InternetShortcut]\n" })).toBeNull();
    expect(linkOf({ path: "a.webloc", text: "<plist/>" })).toBeNull();
    expect(linkOf({ path: "a.url" })).toBeNull();
    expect(linkOf({ path: "a.md", text: "https://c.org" })).toBeNull();
    expect(linkOf({ path: "a.url", text: "URL=ftp://c.org" })).toBeNull();
  });
});

describe("proposeShape", () => {
  it.each(importCorpus().map((entry) => ({ name: entry.name, entry })))("corpus: $name", ({ entry }) => {
    const proposal = proposeShape(entry.files);
    expect({ topics: proposal.topics.map((t) => ({ week: t.week, items: t.items.map((i) => ({ kind: i.kind, files: i.files })) })), tray: proposal.tray }).toEqual(entry.expected);
  });

  it("titles items from file names, and labs from their folder", () => {
    const proposal = proposeShape([{ path: "Week_01-Intro__to--Web.pdf" }, { path: "Week 2 Lab/1 a.md" }, { path: "Week 2 Lab/2 b.md" }]);
    expect(proposal.topics.map((t) => t.items.map((i) => i.title))).toEqual([["Week 01 Intro to Web"], ["Week 2 Lab"]]);
  });

  it("orders a lab's steps by number, 00 included, and ignores litter anywhere", () => {
    const proposal = proposeShape([
      { path: "w1/lab/10 last.md" },
      { path: "w1/lab/2 b.md" },
      { path: "w1/lab/00 setup.md" },
      { path: "w1/lab/02 also-b.md" },
      { path: "w1/lab/.DS_Store" },
      { path: "w1/__MACOSX/x.pdf" },
      { path: "w1/Thumbs.db" },
      { path: "w1/desktop.ini" },
      { path: "w1/~$deck.pptx" }
    ]);
    expect(proposal).toEqual({
      topics: [{ week: 1, items: [{ kind: "lab", title: "lab", files: ["w1/lab/00 setup.md", "w1/lab/02 also-b.md", "w1/lab/2 b.md", "w1/lab/10 last.md"] }] }],
      tray: []
    });
  });

  it("needs two numbered steps, all numbered, in a folder of its own for a lab", () => {
    expect(proposeShape([{ path: "w1/lab/01 a.md" }]).topics[0].items[0].kind).toBe("note");
    expect(proposeShape([{ path: "w1/01 a.md" }, { path: "w1/02 b.md" }, { path: "w1/notes.md" }]).topics.flatMap((t) => t.items.map((i) => i.kind))).toEqual([
      "note",
      "note",
      "note"
    ]);
    expect(proposeShape([{ path: "01 a.md" }, { path: "02 b.md" }]).topics.map((t) => t.week)).toEqual([1, 2]);
  });

  it("places .odt notes, lets dates rank only when no file names a week, and trays a dateless file then", () => {
    expect(proposeShape([{ path: "Week 1.odt" }]).topics[0].items[0].kind).toBe("note");
    const mixed = proposeShape([{ path: "Week 2.pdf" }, { path: "2027-01-25.pdf" }]);
    expect(mixed.topics.map((t) => t.week)).toEqual([2]);
    expect(mixed.tray).toEqual(["2027-01-25.pdf"]);
  });

  it("puts every file of a lab with no week in the tray", () => {
    expect(proposeShape([{ path: "lab/01 a.md" }, { path: "lab/02 b.md" }, { path: "lab/img/x.png" }])).toEqual({
      topics: [],
      tray: ["lab/01 a.md", "lab/02 b.md", "lab/img/x.png"]
    });
  });

  it("orders a week's items talk, note, lab, archive, web, then by path", () => {
    const files = [
      { path: "w1/z.url", text: "URL=https://z" },
      { path: "w1/b.zip" },
      { path: "w1/lab/01 a.md" },
      { path: "w1/lab/02 b.md" },
      { path: "w1/b.md" },
      { path: "w1/b.pdf" },
      { path: "w1/a.pdf" }
    ];
    expect(proposeShape(files).topics[0].items.map((i) => `${i.kind} ${i.files[0]}`)).toEqual([
      "talk w1/a.pdf",
      "talk w1/b.pdf",
      "note w1/b.md",
      "lab w1/lab/01 a.md",
      "archive w1/b.zip",
      "web w1/z.url"
    ]);
  });
});

const spec: CourseSpec = { ...defaultSpec, courseName: "Web Development", courseId: "web-development", lecturerName: "Ada" };
const content = (layout: ReturnType<typeof importLayout>, path: string) => layout.files.find((f) => f.relativePath === path)?.content;

describe("importLayout", () => {
  const proposal: ShapeProposal = {
    topics: [
      {
        week: 1,
        items: [
          { kind: "talk", title: "Intro", files: ["Week 1/Intro Slides.pdf"] },
          { kind: "talk", title: "More", files: ["Week 1/more.pdf"] },
          { kind: "note", title: "Handout", files: ["Week 1/Handout.docx"] },
          { kind: "note", title: "Reading", files: ["Week 1/reading.MD"] }
        ]
      },
      {
        week: 6,
        items: [
          { kind: "lab", title: "Lab", files: ["w6/lab/0 Setup.md", "w6/lab/1 Café Bar.md", "w6/lab/2 ___.md", "w6/lab/img/x.png"] },
          { kind: "archive", title: "Starter", files: ["w6/Starter.zip"] },
          { kind: "web", title: "Docs", files: ["w6/docs.url"], url: "https://docs.org" }
        ]
      }
    ],
    tray: ["x.pptx"]
  };

  it("writes the root files, a topic for every week to the last, units of four and each item", () => {
    const layout = importLayout(spec, proposal);
    const paths = layout.files.map((f) => f.relativePath);
    expect(paths.slice(0, 4)).toEqual(["course.md", "properties.yaml", "netlify.toml", ".gitignore"]);
    expect(paths.filter((p) => p.endsWith("topic.md"))).toEqual([1, 2, 3, 4, 5, 6].map((w) => `unit-${Math.ceil(w / 4)}/topic-0${w}/topic.md`));
    expect(content(layout, "unit-1/unit.md")).toBe("# Weeks 1–4\n");
    expect(content(layout, "unit-2/unit.md")).toBe("# Weeks 5–6\n");
    expect(content(layout, "unit-1/topic-02/topic.md")).toBe("---\nicon:\n  type: fluent-color:lightbulb-24\n---\n\n# Week 2\n");
    expect(content(layout, "unit-1/topic-01/talk-01/talk.md")).toBe("---\nicon:\n  type: fluent-color:slide-text-sparkle-24\n---\n\n# Intro\n");
    expect(content(layout, "unit-1/topic-01/note-01/note.md")).toBe("---\nicon:\n  type: fluent-color:notebook-24\n---\n\n# Handout\n\n[Download Handout](Handout.docx)\n");
    expect(content(layout, "unit-2/topic-06/archive-01/archive.md")).toContain("# Starter\n");
    expect(content(layout, "unit-2/topic-06/web-01/weburl")).toBe("https://docs.org\n");
    expect(content(layout, "unit-2/topic-06/web-01/web.md")).toContain("fluent-color:link-24");
    expect(paths).not.toContain("calendar.yaml");
    expect(layout.copies).toEqual([
      { from: "Week 1/Intro Slides.pdf", to: "unit-1/topic-01/talk-01/Intro-Slides.pdf" },
      { from: "Week 1/more.pdf", to: "unit-1/topic-01/talk-02/more.pdf" },
      { from: "Week 1/Handout.docx", to: "unit-1/topic-01/note-01/Handout.docx" },
      { from: "Week 1/reading.MD", to: "unit-1/topic-01/note-02/note.md" },
      { from: "w6/lab/0 Setup.md", to: "unit-2/topic-06/lab-01/00.Setup.md" },
      { from: "w6/lab/1 Café Bar.md", to: "unit-2/topic-06/lab-01/01.Cafe-Bar.md" },
      { from: "w6/lab/2 ___.md", to: "unit-2/topic-06/lab-01/02.Step-02.md" },
      { from: "w6/lab/img/x.png", to: "unit-2/topic-06/lab-01/img/x.png" },
      { from: "w6/Starter.zip", to: "unit-2/topic-06/archive-01/Starter.zip" }
    ]);
  });

  it("numbers lab steps from 01 when the source starts at 1, names a nameless step, and closes a single-week unit", () => {
    const layout = importLayout(spec, { topics: [{ week: 5, items: [{ kind: "lab", title: "L", files: ["l/1.md", "l/3 b.md"] }] }], tray: [] });
    expect(layout.copies.map((c) => c.to)).toEqual(["unit-2/topic-05/lab-01/01.Step-01.md", "unit-2/topic-05/lab-01/02.b.md"]);
    expect(content(layout, "unit-2/unit.md")).toBe("# Week 5\n");
  });

  it("dates the weeks when given a start, and writes only root files for an empty proposal", () => {
    expect(content(importLayout(spec, proposal, { start: "2027-01-25" }), "calendar.yaml")).toContain("  - date: 2027-03-01\n    week: 6\n");
    expect(() => importLayout(spec, proposal, { start: "2027-02-30" })).toThrow("not a real date");
    expect(importLayout(spec, { topics: [], tray: ["a"] }, { start: "2027-01-25" }).files.map((f) => f.relativePath)).toEqual([
      "course.md",
      "properties.yaml",
      "netlify.toml",
      ".gitignore"
    ]);
  });

  it("lays out every corpus folder as a course with no errors", async () => {
    for (const entry of importCorpus()) {
      const layout = importLayout(spec, proposeShape(entry.files), { start: "2027-01-25" });
      const files: Record<string, string> = Object.fromEntries(layout.files.map((f) => [f.relativePath, f.content]));
      for (const copy of layout.copies) files[copy.to] = copy.to.endsWith(".md") ? "# Step\n" : "%PDF";
      const errors = (await validate(new MemoryFileSystem(files))).filter((f) => f.severity === "error");
      expect(errors, entry.name).toEqual([]);
    }
  });
});

describe("tutors import", () => {
  const temps: string[] = [];
  afterAll(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  const folder = (files: Record<string, string>) => {
    const root = mkdtempSync(join(tmpdir(), "tutors-import-unit-"));
    temps.push(root);
    for (const [path, text] of Object.entries(files)) {
      mkdirSync(dirname(join(root, "src", path)), { recursive: true });
      writeFileSync(join(root, "src", path), text);
    }
    return root;
  };
  const run = async (args: string[]) => {
    let out = "";
    let err = "";
    const status = await runImport(args, { out: (t) => (out += t), err: (t) => (err += t) });
    return { status, out, err };
  };

  it("parses its arguments, and names what is wrong", () => {
    expect(parseImportArgs(["src", "--name", "Web Dev", "--start=2027-01-25", "--lecturer", "Ada", "--out", "o"])).toEqual({
      source: "src",
      spec: { ...defaultSpec, courseName: "Web Dev", courseId: "web-dev", lecturerName: "Ada" },
      start: "2027-01-25",
      outputDir: "o"
    });
    expect(parseImportArgs(["src", "--name", "X"])).toMatchObject({ outputDir: ".", spec: { lecturerName: "" } });
    expect(parseImportArgs(["src", "--name", "X"])).not.toHaveProperty("start");
    expect(parseImportArgs(["a", "b", "--name", "X"])).toMatch(/^Give one folder to import, not two\. Usage: tutors import/);
    expect(parseImportArgs(["src", "--name"])).toMatch(/^--name needs a value\./);
    expect(parseImportArgs(["src", "--name", "X", "--weeks", "3"])).toMatch(/^Unknown option "--weeks"\./);
    expect(parseImportArgs(["--name", "X"])).toMatch(/^Name the folder of material to import\./);
    expect(parseImportArgs(["src"])).toMatch(/^Give the course a name with --name\./);
    expect(parseImportArgs(["src", "--name", "!!"])).toMatch(/^Give the course a name with --name\./);
    expect(parseImportArgs(["src", "--name", "X", "--start", "25/01/2027"])).toMatch(/^--start must be a date like 2027-01-25\./);
  });

  it("reads a folder recursively, with the text of small link files only", () => {
    const root = folder({ "b/a.url": "URL=https://a", "a.pdf": "%PDF", "big.txt": "x".repeat(64 * 1024 + 1), "c.webloc": "<string>https://c</string>" });
    expect(readImportFolder(join(root, "src"))).toEqual([
      { path: "a.pdf" },
      { path: "b/a.url", text: "URL=https://a" },
      { path: "big.txt" },
      { path: "c.webloc", text: "<string>https://c</string>" }
    ]);
  });

  it("imports into a new folder, prints the summary, and refuses to write over an existing course", async () => {
    const root = folder({ "Week 1.pdf": "%PDF", "Week 2.md": "# Notes\n", "misc.bin": "?" });
    const args = [join(root, "src"), "--name", "Web Development", "--out", join(root, "out")];
    const first = await run(args);
    const courseDir = join(root, "out", "web-development");
    expect(first).toEqual({
      status: 0,
      out: `Created ${courseDir}: 2 files placed across weeks 1, 2.\nPlace these by hand (their week or kind isn't clear from the name):\n  misc.bin\nThe course validates clean. Run tutors validate after you place the rest.\n`,
      err: ""
    });
    expect(readFileSync(join(courseDir, "unit-1/topic-02/note-01/note.md"), "utf-8")).toBe("# Notes\n");
    const second = await run(args);
    expect(second.status).toBe(1);
    expect(second.err).toContain("already exists");
  });

  it("fails cleanly on bad arguments, an unreadable folder, a folder with no weeks and a date that isn't one", async () => {
    expect((await run(["--name", "X"])).status).toBe(1);
    const missing = await run([join(tmpdir(), "no-such-folder-for-tutors"), "--name", "X"]);
    expect(missing.status).toBe(1);
    expect(missing.err).toMatch(/^Couldn't read .*no-such-folder-for-tutors: /);
    const root = folder({ "notes.pdf": "%PDF" });
    const empty = await run([join(root, "src"), "--name", "X", "--out", join(root, "out")]);
    expect(empty).toMatchObject({ status: 1, out: "" });
    expect(empty.err).toBe(`Nothing in ${join(root, "src")} names a week (like Week01.pdf or Lecture 3.pdf), so there is no course to propose.\n`);
    const dated = folder({ "Week 1.pdf": "%PDF" });
    const badDate = await run([join(dated, "src"), "--name", "X", "--start", "2027-02-30", "--out", join(dated, "out")]);
    expect(badDate.status).toBe(1);
    expect(badDate.err).toBe('Could not create the course: "2027-02-30" is not a real date\n');
    expect(existsSync(join(dated, "out", "x"))).toBe(false);
  });

  it("the summary counts any errors the new course has (renumbered lab steps leave none to find)", async () => {
    const root = folder({ "Week 1/lab/01 a.md": "# A\n", "Week 1/lab/03 b.md": "# B\n" });
    const proposal = proposeShape(readImportFolder(join(root, "src")));
    expect(proposal.topics[0].items[0].kind).toBe("lab");
    expect(importSummary("c", proposal, 2)).toBe("Created c: 2 files placed across week 1.\ntutors validate found 2 errors; run it in c to see them.\n");
    expect(importSummary("c", { topics: [{ week: 3, items: [{ kind: "talk", title: "t", files: ["a"] }] }], tray: [] }, 1)).toBe(
      "Created c: 1 file placed across week 3.\ntutors validate found 1 error; run it in c to see them.\n"
    );
  });
});
