import { describe, expect, it } from "vitest";
import {
  buildCourseTree,
  checkTree,
  kindName,
  kindOf,
  messages,
  MemoryFileSystem,
  ruleCatalogue,
  slugify,
  sortFindings,
  validate,
  type Finding
} from "../../../packages/jsr/course-rules/src/mod.ts";
import { joinPath, readText } from "../../../packages/jsr/course-rules/src/ports.ts";
import { extensionOf, holdsOnlyImages, isImage, isSkippedFolder } from "../../../packages/jsr/course-rules/src/tree.ts";

const course = (files: Record<string, string>) => new MemoryFileSystem({ "course.md": "# C\n", ...files });
/** The V001-V006 corners below look at errors only: their minimal courses also draw V007-V012 warnings, tested in course-warnings.test.ts. */
const errorsOf = async (fs: MemoryFileSystem, root?: string) => (await validate(fs, root)).filter((f) => f.severity === "error");
const found = async (files: Record<string, string>) => (await errorsOf(course(files))).map((f) => `${f.rule} ${f.path}`);

describe("MemoryFileSystem", () => {
  it("keeps bytes as given, finds a folder by any file under it, and reads paths with extra slashes", async () => {
    const bytes = new Uint8Array([0, 255, 7]);
    const fs = new MemoryFileSystem({ "a.bin": bytes, "topic-1/t.md": "x", "b.md": "y" });
    expect(await fs.read("a.bin")).toBe(bytes);
    expect(await fs.exists("topic-1")).toBe(true);
    expect(await fs.exists("topic")).toBe(false);
    expect(await fs.read("//b.md")).toEqual(new TextEncoder().encode("y"));
    expect(await fs.read("./topic-1/t.md")).toEqual(new TextEncoder().encode("x"));
    expect(await fs.exists("topic-1//")).toBe(true);
  });

  it("lists the files and folders directly inside a folder, with file sizes", async () => {
    const fs = new MemoryFileSystem({ "a.md": "abc", "topic-1/topic.md": "x", "topic-1/talk-1/s.pdf": "%PDF" });
    expect(await fs.list("")).toEqual([
      { name: "a.md", kind: "file", size: 3 },
      { name: "topic-1", kind: "dir" }
    ]);
    expect(await fs.list("topic-1/")).toEqual([
      { name: "topic.md", kind: "file", size: 1 },
      { name: "talk-1", kind: "dir" }
    ]);
    expect(await fs.list("nowhere")).toEqual([]);
  });

  it("reads, writes and normalises paths written with backslashes or a leading ./", async () => {
    const fs = new MemoryFileSystem({ "./topic-1\\topic.md": "# T" });
    expect(await readText(fs, "topic-1/topic.md")).toBe("# T");
    await fs.write("/note-1/note.md", new TextEncoder().encode("# N"));
    expect(fs.paths()).toEqual(["note-1/note.md", "topic-1/topic.md"]);
    await expect(fs.read("missing.md")).rejects.toThrow("missing.md: no such file");
  });

  it("moves a file or a whole folder, and refuses to move what is not there", async () => {
    const fs = new MemoryFileSystem({ "Week 3/topic.md": "# T", "Week 3/talk-1/s.pdf": "%PDF", "Week 30/keep.md": "k" });
    await fs.move("Week 3", "topic-week-3");
    expect(fs.paths()).toEqual(["Week 30/keep.md", "topic-week-3/talk-1/s.pdf", "topic-week-3/topic.md"]);
    await fs.move("Week 30/keep.md", "kept.md");
    expect(fs.paths()).toContain("kept.md");
    await expect(fs.move("gone", "x")).rejects.toThrow("gone: no such file or folder");
  });

  it("says a file, a folder and the root exist, and a prefix of a name does not", async () => {
    const fs = new MemoryFileSystem({ "topic-10/topic.md": "x" });
    expect(await fs.exists("")).toBe(true);
    expect(await fs.exists("topic-10")).toBe(true);
    expect(await fs.exists("topic-10/topic.md")).toBe(true);
    expect(await fs.exists("topic-1")).toBe(false);
  });

  it("joins path segments, dropping empty ones", () => {
    expect(joinPath("", "a", "", "b.md")).toBe("a/b.md");
    expect(joinPath("")).toBe("");
  });
});

describe("the course tree", () => {
  it("reads a folder's kind from its own name the way the generator does", () => {
    expect(kindOf("topic-01")).toBe("topic");
    expect(kindOf("paneltalk-1")).toBe("paneltalk");
    expect(kindOf("panelnote")).toBe("panelnote");
    expect(kindOf("talk")).toBe("talk");
    expect(kindOf("book-lab-01")).toBe("lab");
    expect(kindOf("Lab1")).toBeNull();
    expect(kindOf("Week 3")).toBeNull();
    expect(kindOf("img")).toBeNull();
    expect(kindOf("course-notes")).toBeNull();
  });

  it("skips hidden folders and the generator's output folders, keeps files sorted by name", async () => {
    const tree = await buildCourseTree(course({ "b.md": "", "a.md": "", ".git/x": "", "json/tutors.json": "", "html/index.html": "", "topic-2/t.md": "", "topic-1/t.md": "" }));
    expect(tree.kind).toBe("course");
    expect(tree.path).toBe("");
    expect(tree.files.map((f) => f.name)).toEqual(["a.md", "b.md", "course.md"]);
    expect(tree.children.map((c) => `${c.path}:${c.kind}`)).toEqual(["topic-1:topic", "topic-2:topic"]);
    expect(tree.children[0].files[0]).toEqual({ name: "t.md", path: "topic-1/t.md", size: 0 });
  });

  it("validates a course below the port's root", async () => {
    const fs = new MemoryFileSystem({ "courses/web/course.md": "# W", "courses/web/Week 3/a.pdf": "" });
    expect((await errorsOf(fs, "courses/web")).map((f) => `${f.rule} ${f.path}`)).toEqual(["V002 Week 3"]);
  });

  it("knows images, hidden folders and extensions", () => {
    expect(isSkippedFolder(".github")).toBe(true);
    expect(isSkippedFolder("json")).toBe(true);
    expect(isSkippedFolder("html")).toBe(true);
    expect(isSkippedFolder("jsonx")).toBe(false);
    expect(extensionOf("Main.PNG")).toBe("PNG");
    expect(extensionOf(".gitignore")).toBe("");
    expect(extensionOf("weburl")).toBe("");
    expect(isImage("main.jpeg")).toBe(true);
    expect(isImage("slides.pdf")).toBe(false);
  });

  it("an img folder of images, even nested, holds only images; one with a PDF or a typed folder does not", async () => {
    const tree = await buildCourseTree(course({ "img/main.png": "", "img/old/a.jpg": "", "pics/a.png": "", "pics/a.pdf": "", "art/topic-1/a.png": "" }));
    const byName = (name: string) => tree.children.find((c) => c.name === name)!;
    expect(holdsOnlyImages(byName("img"))).toBe(true);
    expect(holdsOnlyImages(byName("pics"))).toBe(false);
    expect(holdsOnlyImages(byName("art"))).toBe(false);
  });
});

describe("V001-V006 corners", () => {
  it("V001 is reported once, against the root, and only when course.md is missing", async () => {
    expect((await errorsOf(new MemoryFileSystem({ "Course.md": "" }))).map((f) => [f.rule, f.path])).toEqual([["V001", ""]]);
    expect(await found({})).toEqual([]);
  });

  it("V002 names a folder once and not what is inside it, and suggests a topic name only where a topic can go", async () => {
    const findings = await errorsOf(
      course({
        "Week 3/talk-1/s.pdf": "",
        "unit-1/u.md": "",
        "unit-1/Extra Reading/a.pdf": "",
        "side/s.md": "",
        "side/Misc/a.marp": "",
        "topic-1/t.md": "",
        "topic-1/old/01.Setup.md": ""
      })
    );
    expect(findings.map((f) => [f.path, f.suggestedName])).toEqual([
      ["Week 3", "topic-week-3"],
      ["side/Misc", "topic-misc"],
      ["topic-1/old", undefined],
      ["unit-1/Extra Reading", "topic-extra-reading"]
    ]);
    expect(findings.find((f) => f.path === "topic-1/old")!.message).toContain("Rename it so it starts with the kind");
    expect(findings.find((f) => f.path === "Week 3")!.message).toContain("Rename it to topic-week-3.");
    expect("suggestedName" in findings.find((f) => f.path === "topic-1/old")!).toBe(false);
  });

  it("V002 counts slides, a video id, lab steps and learning objects at any depth as course material", async () => {
    const material = { "a/x.pdf": "", "b/x.marp": "", "c/videoid": "", "d/02.Step.md": "", "e/deep/note-1/n.md": "", "f/deep/x.pdf": "", "h/topic.md": "", "i/book.md": "" };
    expect(await found(material)).toEqual(["V002 a", "V002 b", "V002 c", "V002 d", "V002 e", "V002 f", "V002 h", "V002 i"]);
  });

  it("V018 warns, without a fix, about a folder of working files: code, scripts, notes to self, a step-like name without a number", async () => {
    const working = {
      "code/topic-05/search.py": "",
      "scripts/build.sh": "",
      "exams/README.md": "",
      "slides/1-theory.md": "",
      "x/Setup.md": "",
      "y/1.md": "",
      "videos/videoid.txt": "",
      "z/a01.Setup.md": "",
      "w/01.Setup.md.bak": "",
      "course-extra/x.py": ""
    };
    const findings = await validate(course(working));
    expect(findings.filter((f) => f.rule === "V018").map((f) => `${f.severity} ${f.path} ${f.suggestedName ?? "-"} ${"fix" in f}`)).toEqual([
      "warn code - false",
      "warn course-extra - false",
      "warn exams - false",
      "warn scripts - false",
      "warn slides - false",
      "warn videos - false",
      "warn w - false",
      "warn x - false",
      "warn y - false",
      "warn z - false"
    ]);
    expect(findings.find((f) => f.path === "code")!.message).toBe(messages.V018("code", "topic-code"));
    expect(messages.V018("code", "topic-code")).toContain(
      "That's fine for working files such as code, scripts or slide sources. If it holds course material, rename it to topic-code."
    );
    expect(messages.V018("old")).toContain("rename it so it starts with the kind of content it holds, like talk- or note-.");
  });

  it("names no folder inside a lab, note or talk: it is that learning object's resource folder, which the generator publishes", async () => {
    const files = {
      "topic-1/t.md": "",
      "topic-1/book-1/01.A.md": "# A\n",
      "topic-1/book-1/assets/s.py": "",
      "topic-1/book-1/assets/deep/x.pdf": "",
      "topic-1/note-1/n.md": "# N\n",
      "topic-1/note-1/data/d.csv": ""
    };
    expect((await validate(course(files))).filter((f) => f.rule === "V002" || f.rule === "V018")).toEqual([]);
  });

  it("V003 covers units, sides and topics but not the root or simple kinds", async () => {
    expect(await found({ "unit-1/x.pdf": "", "side/x.png": "", "topic-1/x.txt": "" })).toEqual(["V003 side", "V003 topic-1", "V003 unit-1"]);
    expect((await errorsOf(course({ "side/x.png": "" })))[0].message).toBe(messages.V003("side"));
  });

  it("V004 talks: a videoid or a Marp deck stands in for a PDF; a talk with no .md is named", async () => {
    expect(await found({ "talk-1/t.md": "", "talk-1/videoid": "abc" })).toEqual([]);
    expect(await found({ "talk-1/t.md": "", "talk-1/deck.marp": "---\nmarp: true\n---\n" })).toEqual([]);
    expect(await found({ "paneltalk-1/t.md": "" })).toEqual(["V004 paneltalk-1"]);
    expect(await found({ "talk-1/s.pdf": "" })).toEqual(["V004 talk-1"]);
    const two = await errorsOf(course({ "talk-1/t.md": "", "talk-1/a.pdf": "", "talk-1/b.pdf": "" }));
    expect(two.map((f) => f.message)).toEqual([messages.talkTwoPdfs(["a.pdf", "b.pdf"])]);
    expect((await errorsOf(course({ "talk-1/t.md": "" })))[0].message).toBe(messages.talkNoSlides());
    expect((await errorsOf(course({ "talk-1/s.pdf": "" })))[0].message).toBe(messages.talkMissingDescriptor());
  });

  it("V004 notes: none and two are both named; one passes", async () => {
    expect((await errorsOf(course({ "panelnote-1/x.png": "" })))[0].message).toBe(messages.noteMissing());
    expect((await errorsOf(course({ "note-1/a.md": "", "note-1/b.md": "" })))[0].message).toBe(messages.noteTwoFiles(["a.md", "b.md"]));
    expect(await found({ "note-1/a.md": "" })).toEqual([]);
  });

  it("V004 labs: steps are named NN.Title.md; V019 warns when they start above 01 or skip a number", async () => {
    expect(await found({ "lab-1/00.Setup.md": "", "lab-1/01.Go.md": "" })).toEqual([]);
    expect(await found({ "book-1/01.Setup.md": "", "book-1/02.Go.md": "" })).toEqual([]);
    expect((await errorsOf(course({ "lab-1/x.png": "" })))[0].message).toBe(messages.labNoSteps());
    const steps = async (files: Record<string, string>) => (await validate(course(files))).filter((f) => f.path === "lab-1");
    expect(await steps({ "lab-1/02.Setup.md": "" })).toMatchObject([{ rule: "V019", severity: "warn", message: messages.labFirstStep("02") }]);
    expect(await steps({ "lab-1/00.A.md": "", "lab-1/02.B.md": "" })).toMatchObject([{ rule: "V019", severity: "warn", message: messages.labStepOrder("01", "02") }]);
    expect(await steps({ "lab-1/00.A.md": "", "lab-1/01.B.md": "", "lab-1/03.C.md": "", "lab-1/05.D.md": "" })).toHaveLength(1);
    expect(await errorsOf(course({ "lab-1/00.A.md": "", "lab-1/02.B.md": "" }))).toEqual([]);
    expect(await found({ "lab-1/1.Setup.md": "", "lab-1/01..md": "" })).toEqual(["V004 lab-1/01..md", "V004 lab-1/1.Setup.md"]);
    expect(await found({ "lab-1/01.Setup.md": "", "lab-1/01.Again.md": "" })).toEqual([]);
  });

  it("V005 accepts a web address and both GitHub forms, reads only the first line, and tolerates CRLF", async () => {
    expect(await found({ "web-1/w.md": "", "web-1/weburl": "https://example.com/x\r\nignored" })).toEqual([]);
    expect(await found({ "web-1/w.md": "", "web-1/weburl": "http://example.com" })).toEqual([]);
    expect(await found({ "web-1/w.md": "", "web-1/weburl": "/course/edeleastar-portfolio-web-dev-1" })).toEqual([]);
    expect(await found({ "web-1/w.md": "", "web-1/weburl": "example.com" })).toEqual(["V005 web-1/weburl"]);
    expect(await found({ "web-1/w.md": "", "web-1/weburl": "https://a b" })).toEqual(["V005 web-1/weburl"]);
    expect(await found({ "github-1/g.md": "", "github-1/githubid": "https://github.com/tutors-sdk/tutors/" })).toEqual([]);
    expect(await found({ "github-1/g.md": "", "github-1/githubid": "tutors-sdk/tutors.dev" })).toEqual([]);
    expect(await found({ "github-1/g.md": "", "github-1/githubid": "https://gitlab.com/a/b" })).toEqual(["V005 github-1/githubid"]);
    expect(await found({ "github-1/g.md": "", "github-1/githubid": "a/b/c" })).toEqual(["V005 github-1/githubid"]);
    expect(await found({ "topic-1/t.md": "", "topic-1/github-1/g.md": "" })).toEqual(["V005 topic-1/github-1"]);
    expect(await found({ "Old/web-1/w.md": "" })).toEqual(["V002 Old"]);
    expect((await errorsOf(course({ "web-1/w.md": "" })))[0].message).toBe(messages.linkMissing("web", "weburl"));
  });

  it("V006 holds enrollment to the lists the reader accepts", async () => {
    expect(await found({ "enrollment.yaml": "educators: [alice]\nwhitelist: [bob]\nstudents:\n  - {name: Cat, id: cat1}\n" })).toEqual([]);
    expect(await found({ "enrollment.yaml": "educators:\nstudents: []\n" })).toEqual(["V006 enrollment.yaml"]);
    expect(await found({ "enrollment.yaml": "educators: alice\n" })).toEqual(["V006 enrollment.yaml"]);
    expect(await found({ "enrollment.yaml": "whitelist: [1234]\n" })).toEqual(["V006 enrollment.yaml"]);
    expect(await found({ "enrollment.yaml": "students: [cat]\n" })).toEqual(["V006 enrollment.yaml"]);
    expect(await found({ "enrollment.yaml": "students:\n  - {name: Cat}\n" })).toEqual(["V006 enrollment.yaml"]);
    expect(await found({ "enrollment.yaml": "students:\n  - {name: 5, id: cat1}\n" })).toEqual(["V006 enrollment.yaml"]);
    expect(await found({ "enrollment.yaml": "students:\n  - {id: cat1}\n" })).toEqual(["V006 enrollment.yaml"]);
    expect(await found({ "enrollment.yaml": "- alice\n" })).toEqual(["V006 enrollment.yaml"]);
  });

  it("V003 and V004 match extensions as the generator does, case and all", async () => {
    expect(await found({ "topic-1/topic.MD": "# T\n" })).toContain("V003 topic-1");
    expect(await found({ "topic-1/topic.md": "# T\n", "topic-1/talk-1/talk.md": "# T\n", "topic-1/talk-1/slides.PDF": "%PDF" })).toContain("V004 topic-1/talk-1");
  });

  it("V006 accepts empty and comment-only files, names the line of a parse error, and checks the calendar has weeks", async () => {
    expect(await found({ "properties.yaml": "", "enrollment.yaml": "# all commented out\n", "badges.yaml": "x: 1\n" })).toEqual([]);
    expect(await found({ "properties.yaml": "- a\n", "badges.yaml": "just text" })).toEqual(["V006 badges.yaml", "V006 properties.yaml"]);
    expect(await found({ "calendar.yaml": "title: S1\nweeks: none\n" })).toEqual(["V006 calendar.yaml"]);
    expect(await found({ "calendar.yaml": "" })).toEqual(["V006 calendar.yaml"]);
    expect(await found({ "calendar.yaml": "weeks:\n  - date: 2027-01-25\n    week: 1\n  - 2027-02-01: {title: Two, type: topic}\n" })).toEqual([]);
    expect(await found({ "calendar.yaml": "weeks: [invalid]\n" })).toEqual(["V006 calendar.yaml"]);
    expect(await found({ "calendar.yaml": "weeks:\n  - null\n" })).toEqual(["V006 calendar.yaml"]);
    expect(await found({ "calendar.yaml": "weeks:\n  - topic: no date\n" })).toEqual(["V006 calendar.yaml"]);
    expect(await found({ "calendar.yaml": "weeks:\n  - 2027-02-01: {title: Two}\n    2027-02-08: {title: Three}\n" })).toEqual(["V006 calendar.yaml"]);
    expect(await found({ "topic-1/t.md": "", "topic-1/properties.yaml": "\t:" })).toEqual([]);
    const [broken] = await errorsOf(course({ "properties.yaml": "a: 1\n\tb: 2\n" }));
    expect(broken.message).toMatch(/^properties\.yaml can't be read: line 2, tab characters/);
    const [shape] = await errorsOf(course({ "properties.yaml": "- a\n" }));
    expect(shape.message).toBe(messages.yamlShape("properties.yaml", "a list of name: value lines"));
  });
});

describe("findings", () => {
  it("are sorted errors first, then by path, then by rule", () => {
    const f = (rule: Finding["rule"], severity: Finding["severity"], path: string): Finding => ({ rule, severity, path, message: "" });
    const sorted = sortFindings([f("V002", "info", "a"), f("V004", "error", "b"), f("V003", "error", "b"), f("V001", "warn", ""), f("V005", "error", "a")]);
    expect(sorted.map((x) => `${x.severity} ${x.path} ${x.rule}`)).toEqual(["error a V005", "error b V003", "error b V004", "warn  V001", "info a V002"]);
  });

  it("checkTree needs no file contents", async () => {
    expect(checkTree(await buildCourseTree(new MemoryFileSystem({ "Week 3/a.pdf": "" }))).map((x) => x.rule)).toEqual(["V001", "V002"]);
  });

  it("carry the catalogue's severity, and the catalogue lists V001-V020 once each, in id order", async () => {
    expect(ruleCatalogue.map((r) => r.id)).toEqual(Array.from({ length: 20 }, (_, i) => `V${String(i + 1).padStart(3, "0")}`));
    expect(ruleCatalogue.map((r) => r.severity)).toEqual([...Array(6).fill("error"), ...Array(5).fill("warn"), "info", "error", "warn", "error", "warn", "error", "warn", "warn", "error"]);
    expect((await errorsOf(new MemoryFileSystem({}))).map((x) => x.severity)).toEqual(["error"]);
  });

  it("slugify makes lower-case ASCII hyphenated names", () => {
    expect(slugify("Week 3")).toBe("week-3");
    expect(slugify("  Topic 01 – Intro  ")).toBe("topic-01-intro");
    expect(slugify("Café Ünïcode")).toBe("cafe-unicode");
    expect(slugify("--Lab1--")).toBe("lab1");
  });

  it("kind names are a lecturer's words, falling back to the kind", () => {
    expect(kindName("paneltalk")).toBe("Panel talk");
    expect(kindName("side")).toBe("Side unit");
    expect(kindName("quiz")).toBe("Quiz");
    expect(kindName("podcast")).toBe("podcast");
    expect(messages.linkEmpty("web", "weburl")).toContain("a web address");
    expect(messages.linkEmpty("github", "githubid")).toContain("a repository");
    expect(messages.linkMissing("github", "githubid")).toContain("repository address");
  });
});
