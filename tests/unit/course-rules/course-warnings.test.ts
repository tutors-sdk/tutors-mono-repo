import { describe, expect, it } from "vitest";
import {
  applyFixes,
  fileSlug,
  fixCourse,
  IMAGE_LIMIT_BYTES,
  MemoryFileSystem,
  messages,
  netlifyToml,
  planFixes,
  titleOf,
  validate,
  type FileOp,
  type FileSystemPort,
  type Finding
} from "../../../packages/jsr/course-rules/src/mod.ts";
import { bodyOf, imageSources, resolveSource } from "../../../packages/jsr/course-rules/src/warnings.ts";
import { netlifyToml as createNetlifyToml } from "../../../packages/jsr/create/src/templates.ts";
import { fixSummary, runValidate } from "../../../packages/jsr/create/src/validate-cli.ts";

const NETLIFY = '[build]\n  publish = "json"\n';
const course = (files: Record<string, string | Uint8Array>) => new MemoryFileSystem({ "course.md": "# C\n", "netlify.toml": NETLIFY, ...files });
const warnings = async (files: Record<string, string | Uint8Array>, rule: string) =>
  (await validate(course(files))).filter((f) => f.rule === rule).map((f) => `${f.path}${f.suggestedName ? ` -> ${f.suggestedName}` : ""}${f.fix ? " (fix)" : ""}`);

describe("V007 names", () => {
  it("fileSlug keeps case and extension, drops accents and turns spaces into single hyphens", () => {
    expect(fileSlug("Café Notes.PDF")).toBe("Cafe-Notes.PDF");
    expect(fileSlug("  Week  1 – Intro .md")).toBe("Week-1-Intro.md");
    expect(fileSlug("ñ.md")).toBe("n.md");
    expect(fileSlug("中文.pdf")).toBe("file.pdf");
    expect(fileSlug("weburl")).toBe("weburl");
    expect(fileSlug(".hidden name")).toBe(".hidden-name");
  });

  it("flags capitals in typed folders, offers a fix only when the kind survives, and never flags the root or untyped folders", async () => {
    expect(await warnings({ "topic-01/topic.md": "# T\n", "topic-01/talk-A/talk.md": "# A\n", "topic-01/talk-A/a.pdf": "%PDF" }, "V007")).toEqual([
      "topic-01/talk-A -> talk-a (fix)"
    ]);
    // "topicÉté" slugifies to "topicete", still a topic; "unit_A" to "unit-a".
    expect(await warnings({ "unit_A/unit.md": "# U\n", "unit_A/topic-01/topic.md": "# T\n", "unit_A/topic-01/note-1/n.md": "# N\n" }, "V007")).toEqual(["unit_A -> unit-a (fix)"]);
    expect(await warnings({ "talk.Intro/talk.md": "# T\n", "talk.Intro/s.pdf": "%PDF" }, "V007")).toEqual(["talk.Intro -> talk-intro (fix)"]);
    // A folder whose slug would read as another kind is named but not renamed unasked.
    expect(await warnings({ "note Lab/n.md": "# N\n" }, "V007")).toEqual(["note Lab -> note-lab (fix)"]);
    expect(await warnings({ "Week 3/x.md": "", "img/A B.png": "PNG" }, "V007")).toEqual([]);
    expect(await warnings({ "topic-01/topic.md": "# T\n", "topic-01/talk-01/talk.md": "# A\n", "topic-01/talk-01/a.pdf": "%PDF" }, "V007")).toEqual([]);
  });

  it("does not offer a rename that would change a folder's kind", async () => {
    // "Talk" has no kind at all (V002); "talkS" lower-cases to "talks", still a talk.
    expect(await warnings({ "talkS/t.md": "# T\n", "talkS/s.pdf": "%PDF" }, "V007")).toEqual(["talkS -> talks (fix)"]);
    expect(await warnings({ "topic-Ü/topic.md": "# T\n", "topic-Ü/note-1/n.md": "# N\n" }, "V007")).toEqual(["topic-Ü -> topic-u (fix)"]);
    expect(await warnings({ "web-Ä/weburl": "https://a.b\n" }, "V007")).toEqual(["web-Ä -> web-a (fix)"]);
    expect(await warnings({ "web-!/weburl": "https://a.b\n" }, "V007")).toEqual(["web-! -> web (fix)"]);
    expect(await warnings({ "lab_1/01.A.md": "# A\n" }, "V007")).toEqual([]);
    expect(await warnings({ "topic-01/topic.md": "# T\n", "topic-01/web-é/weburl": "https://a.b\n" }, "V007")).toEqual(["topic-01/web-é -> web-e (fix)"]);
  });

  it("offers no rename for a file a page links to, as written or URL-encoded", async () => {
    const base = { "course.md": "# C\n", "topic-01/topic.md": "# T\n", "topic-01/note-1/n.md": "# N\n" };
    expect(await warnings({ ...base, "topic-01/note-1/Week 1 Slides.pdf": "%PDF", "topic-01/note-1/n.md": "# N\n[Slides](Week%201%20Slides.pdf)\n" }, "V007")).toEqual([
      "topic-01/note-1/Week 1 Slides.pdf -> Week-1-Slides.pdf"
    ]);
    expect(await warnings({ ...base, "topic-01/note-1/Week 1.pdf": "%PDF", "topic-01/topic.md": "# T\nSee Week 1.pdf\n" }, "V007")).toEqual([
      "topic-01/note-1/Week 1.pdf -> Week-1.pdf"
    ]);
    expect(await warnings({ ...base, "topic-01/note-1/Week 1.pdf": "%PDF" }, "V007")).toEqual(["topic-01/note-1/Week 1.pdf -> Week-1.pdf (fix)"]);
  });

  it("names files with spaces or accents at the root and in typed folders, and fixes all but images", async () => {
    expect(await warnings({ "Read Me.md": "x", "topic-01/topic.md": "# T\n", "topic-01/Main Pic.png": "PNG", "topic-01/note-1/n.md": "# N\n" }, "V007")).toEqual([
      "Read Me.md -> Read-Me.md (fix)",
      "topic-01/Main Pic.png -> Main-Pic.png"
    ]);
    const [finding] = (await validate(course({ "Read Me.md": "x" }))).filter((f) => f.rule === "V007");
    expect(finding.message).toBe(messages.fileName("Read Me.md", "Read-Me.md"));
    expect(finding.severity).toBe("warn");
    expect(finding.fix).toEqual({ op: "move", from: "Read Me.md", to: "Read-Me.md" });
    const [folder] = (await validate(course({ "talk-A/t.md": "# T\n", "talk-A/s.pdf": "%PDF" }))).filter((f) => f.rule === "V007");
    expect(folder.message).toBe(messages.folderName("talk-A", "talk-a"));
  });
});

describe("V008 titles", () => {
  it("reads the title after front matter and blank lines, less one #", () => {
    expect(titleOf("# Week 1\nbody")).toBe("Week 1");
    expect(titleOf("Week 1\n")).toBe("Week 1");
    expect(titleOf("## Two\n")).toBe("# Two");
    expect(titleOf("---\nicon: x\n---\n\n\n# After\n")).toBe("After");
    expect(titleOf("﻿---\r\nicon: x\r\n...\r\n# Dots\r\n")).toBe("Dots");
    expect(titleOf("---\nicon: x\n---")).toBe("");
    expect(titleOf("\n# Late\n")).toBe("");
    expect(titleOf("#\n")).toBe("");
    expect(bodyOf("--- not front matter\n# T")).toBe("--- not front matter\n# T");
    expect(bodyOf("---\nunclosed\n# T")).toBe("---\nunclosed\n# T");
  });

  it("checks the card's own .md: course.md, a lab's first step, a composite's or talk's first .md", async () => {
    expect(await warnings({ "course.md": "\n", "lab-1/notes.md": "", "lab-1/01.A.md": "# A\n" }, "V008")).toEqual(["course.md"]);
    expect(await warnings({ "lab-1/00.A.md": "\n", "lab-1/01.B.md": "" }, "V008")).toEqual(["lab-1/00.A.md"]);
    expect(await warnings({ "topic-01/a.md": "\n", "topic-01/b.md": "# B\n", "topic-01/note-1/n.md": "# N\n" }, "V008")).toEqual(["topic-01/a.md"]);
    expect(await warnings({ "topic-01/topic.md": "# T\n", "topic-01/x.png": "PNG", "topic-01/note-1/n.md": "# N\n" }, "V008")).toEqual([]);
    expect(await warnings({ "side/x.png": "PNG" }, "V008")).toEqual([]);
    const [finding] = (await validate(course({ "topic-01/topic.md": "", "topic-01/note-1/n.md": "# N\n" }))).filter((f) => f.rule === "V008");
    expect(finding.message).toBe(messages.noTitle("topic.md"));
  });
});

describe("V009 images", () => {
  it("finds markdown and HTML images outside code, once each", () => {
    expect(
      imageSources(
        '![a](img/a.png)\n![b](<img/b c.png> "title")\n<IMG alt="x" SRC=\'c.jpg\'>\n`![inline](no.png)`\n```\n![code](no2.png)\n```\n~~~\n![tilde](no3.png)\n~~~\n![a](img/a.png)'
      )
    ).toEqual(["img/a.png", "img/b c.png", "c.jpg"]);
    expect(imageSources("![x]( spaced.png )")).toEqual(["spaced.png"]);
  });

  it("resolves sources against the page's folder and ignores web addresses and paths outside the course", () => {
    expect(resolveSource("topic-01/note-1", "img/a.png")).toBe("topic-01/note-1/img/a.png");
    expect(resolveSource("topic-01/note-1", "./img//a.png?v=2#x")).toBe("topic-01/note-1/img/a.png");
    expect(resolveSource("topic-01/note-1", "../shared/a%20b.png")).toBe("topic-01/shared/a b.png");
    expect(resolveSource("", "a.png")).toBe("a.png");
    expect(resolveSource("", "../a.png")).toBeNull();
    expect(resolveSource("t", "100%.png")).toBe("t/100%.png");
    for (const web of ["https://x.org/a.png", "HTTP://x/a.png", "data:image/png;base64,AA", "/abs.png", "#frag", "mailto:a@b"]) expect(resolveSource("t", web)).toBeNull();
  });

  it("names a missing image and one at or over the limit, with its size", async () => {
    const big = new Uint8Array(IMAGE_LIMIT_BYTES);
    const files = { "note-1/n.md": "# N\n![a](a.png) ![b](b.png) ![c](c.png) ![w](https://x/w.png)", "note-1/a.png": big, "note-1/b.png": new Uint8Array(IMAGE_LIMIT_BYTES - 1) };
    const found = (await validate(course(files))).filter((f) => f.rule === "V009");
    expect(found.map((f) => f.message)).toEqual([messages.imageLarge("a.png", "2.0"), messages.imageMissing("c.png")]);
    expect(found.every((f) => f.path === "note-1/n.md" && f.severity === "warn")).toBe(true);
    expect(IMAGE_LIMIT_BYTES).toBe(2 * 1024 * 1024);
  });

  it("finds images in img folders, and skips sizes an adapter could not give", async () => {
    const fs: FileSystemPort = course({ "note-1/n.md": "# N\n![a](img/a.png)", "note-1/img/a.png": "PNG" });
    const sizeless: FileSystemPort = {
      list: async (dir) => (await fs.list(dir)).map(({ name, kind }) => ({ name, kind })),
      read: (path) => fs.read(path),
      write: (path, bytes) => fs.write(path, bytes),
      move: (from, to) => fs.move(from, to),
      exists: (path) => fs.exists(path)
    };
    for (const port of [fs, sizeless]) expect((await validate(port)).filter((f) => f.rule === "V009")).toEqual([]);
    expect(await warnings({ "Week 3/n.md": "![a](gone.png)", "topic-01/topic.md": "# T\n![a](gone.png)", "topic-01/note-1/n.md": "# N\n" }, "V009")).toEqual(["topic-01/topic.md"]);
  });
});

describe("V010 topic numbers", () => {
  const topics = (...names: string[]) =>
    Object.fromEntries(
      names.flatMap((name) => [
        [`${name}/topic.md`, `# ${name}\n`],
        [`${name}/note-1/n.md`, "# N\n"]
      ])
    );

  it("accepts a sequence starting anywhere, topic_N and topicN, and a lone unnumbered topic", async () => {
    expect(await warnings(topics("topic-05", "topic-06", "topic-07"), "V010")).toEqual([]);
    expect(await warnings(topics("topic_1", "topic_2"), "V010")).toEqual([]);
    expect(await warnings(topics("topic1", "topic2"), "V010")).toEqual([]);
    expect(await warnings(topics("topic-intro"), "V010")).toEqual([]);
    expect(
      await warnings({ ...topics("unit-1/topic-01", "unit-1/topic-02", "unit-2/topic-03", "unit-2/topic-04"), "unit-1/unit.md": "# U\n", "unit-2/unit.md": "# U\n" }, "V010")
    ).toEqual([]);
  });

  it("names each topic that breaks the sequence, a repeat included", async () => {
    expect(await warnings(topics("topic-01", "topic-01b", "topic-03"), "V010")).toEqual(["topic-01b", "topic-03"]);
    expect(await warnings(topics("topic-a", "topic-01", "topic-02"), "V010")).toEqual(["topic-a"]);
    const [gap] = (await validate(course(topics("topic-01", "topic-03")))).filter((f) => f.rule === "V010");
    expect(gap.message).toBe(messages.topicOutOfSequence("topic-01", "topic-03"));
    const [unnumbered] = (await validate(course(topics("topic-01", "topic-x")))).filter((f) => f.rule === "V010");
    expect(unnumbered.message).toBe(messages.topicUnnumbered("topic-x"));
  });
});

describe("V011 netlify.toml", () => {
  const check = async (toml: string) =>
    (await validate(new MemoryFileSystem({ "course.md": "# C\n", "netlify.toml": toml }))).filter((f) => f.rule === "V011").map((f) => f.message);

  it("accepts json or html, quoted either way, with or without ./ and a trailing slash", async () => {
    for (const publish of ['"json"', "'html'", '"./json/"', '"/html"', '  "json"  ']) expect(await check(`[build]\n  publish =${publish}\n`), publish).toEqual([]);
  });

  it("reads publish from the [build] table only, not another context's", async () => {
    expect(await check('[build]\n  publish = "public"\n[context.deploy-preview]\n  publish = "json"\n')).toEqual([messages.netlifyPublish()]);
    expect(await check('[build]\n  command = "x"\n  publish = "json" # generator output\n[context.deploy-preview]\n  publish = "public"\n')).toEqual([]);
    expect(await check('[ build ]\npublish = "json"\n')).toEqual([]);
  });

  it("rejects any other folder, and a publish line that is commented out", async () => {
    for (const toml of ['[build]\n  publish = "."\n', '[build]\n  publish = "public"\n', '# publish = "json"\n', '[build]\n  publish = "jsonx"\n', 'publish = "json" # x\n']) {
      expect(await check(toml), toml).toEqual([messages.netlifyPublish()]);
    }
  });

  it("offers the standard file when there is none, the same bytes tutors create writes", async () => {
    const [missing] = (await validate(new MemoryFileSystem({ "course.md": "# C\n" }))).filter((f) => f.rule === "V011");
    expect(missing).toEqual({
      rule: "V011",
      severity: "warn",
      path: "netlify.toml",
      message: messages.netlifyMissing(),
      fix: { op: "write", path: "netlify.toml", content: netlifyToml }
    });
    expect(netlifyToml).toBe(createNetlifyToml());
  });
});

describe("V012 empty", () => {
  it("notes units, sides and topics with no learning objects, but not the course, links or folders of images", async () => {
    expect(
      await warnings(
        { "unit-1/unit.md": "# U\n", "unit-1/img/x.png": "PNG", "side/side.md": "# S\n", "side/note-1/n.md": "# N\n", "topic-01/topic.md": "# T\n", "topic-01/Old/x.md": "" },
        "V012"
      )
    ).toEqual(["topic-01", "unit-1"]);
    expect(await warnings({ "web-1/weburl": "https://a.b\n" }, "V012")).toEqual([]);
    const [note] = (await validate(course({ "side/side.md": "# S\n" }))).filter((f) => f.rule === "V012");
    expect(note).toMatchObject({ severity: "info", message: messages.empty("side") });
  });
});

describe("--fix", () => {
  const move = (from: string, to: string): FileOp => ({ op: "move", from, to });
  const withFix = (fix: FileOp): Finding => ({ rule: "V007", severity: "warn", path: "", message: "", fix });

  it("plans each fix once, deepest path first, then by path, and skips findings with no fix", () => {
    const plan = planFixes([
      withFix(move("talk-A", "talk-a")),
      withFix(move("talk-A/B C.pdf", "talk-A/B-C.pdf")),
      withFix({ op: "write", path: "netlify.toml", content: "x" }),
      withFix(move("talk-A", "talk-a")),
      withFix(move("b", "c")),
      { rule: "V001", severity: "error", path: "", message: "" }
    ]);
    expect(plan).toEqual([move("talk-A/B C.pdf", "talk-A/B-C.pdf"), move("b", "c"), { op: "write", path: "netlify.toml", content: "x" }, move("talk-A", "talk-a")]);
  });

  it("writes, renames and renames by case through a temporary name, below a root", async () => {
    const fs = new MemoryFileSystem({ "c/talk-A/s.pdf": "%PDF", "c/x y.md": "x" });
    const outcome = await applyFixes(fs, "c", [move("x y.md", "x-y.md"), move("talk-A", "talk-a"), { op: "write", path: "netlify.toml", content: "N" }]);
    expect(outcome.skipped).toEqual([]);
    expect(outcome.applied).toHaveLength(3);
    expect(fs.paths()).toEqual(["c/netlify.toml", "c/talk-a/s.pdf", "c/x-y.md"]);
    expect(new TextDecoder().decode(await fs.read("c/netlify.toml"))).toBe("N");
  });

  it("never overwrites: an existing file or folder skips the operation, and a refusal is reported, not thrown", async () => {
    const fs = new MemoryFileSystem({ "netlify.toml": "mine", "a/x": "1", "b/x": "2", "talk-A/t.md": "", "talk-a/t.md": "" });
    const refusing: FileSystemPort = {
      list: (d) => fs.list(d),
      read: (p) => fs.read(p),
      exists: (p) => fs.exists(p),
      write: (p, b) => fs.write(p, b),
      move: () => Promise.reject("disk full")
    };
    expect((await applyFixes(fs, "", [{ op: "write", path: "netlify.toml", content: "x" }, move("a", "b"), move("talk-A", "talk-a")])).skipped.map((s) => s.reason)).toEqual([
      "netlify.toml already exists",
      "b already exists",
      "talk-a already exists"
    ]);
    expect(new TextDecoder().decode(await fs.read("netlify.toml"))).toBe("mine");
    expect((await applyFixes(refusing, "", [move("a", "z")])).skipped).toEqual([{ op: move("a", "z"), reason: "disk full" }]);
    const throwing: FileSystemPort = { ...refusing, move: () => Promise.reject(new Error("locked")) };
    expect((await applyFixes(throwing, "", [move("a", "z")])).skipped[0].reason).toBe("locked");
  });

  it("fixCourse renames V002 and V007, writes netlify.toml, and reports what is left", async () => {
    const fs = new MemoryFileSystem({ "course.md": "# C\n", "Week 3/topic.md": "# W\n", "Week 3/note-1/n.md": "# N\n", "topic-01/topic.md": "# T\n", "topic-01/Old/n.md": "" });
    const result = await fixCourse(fs);
    expect(result.applied.map((op) => (op.op === "move" ? op.to : op.path))).toEqual(["topic-week-3", "netlify.toml"]);
    expect(result.findings.map((f) => `${f.rule} ${f.path}`)).toEqual(["V002 topic-01/Old", "V010 topic-week-3", "V012 topic-01"]);
  });
});

describe("tutors validate --fix", () => {
  const io = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { out: (t: string) => out.push(t), err: (t: string) => err.push(t) } };
  };

  it("prints what it fixed, then the report of what is left; JSON keeps the log on stderr", async () => {
    const text = io();
    const fs = new MemoryFileSystem({ "course.md": "# C\n" });
    expect(await runValidate(["--fix"], { ...text.io, open: () => fs })).toBe(0);
    expect(text.out.join("")).toBe("fixed   write netlify.toml\nEverything checks out.\n");

    const json = io();
    const again = new MemoryFileSystem({ "course.md": "# C\n", "Read Me.md": "x" });
    expect(await runValidate(["--fix", "--format", "json"], { ...json.io, open: () => again })).toBe(0);
    expect(JSON.parse(json.out.join(""))).toEqual([]);
    expect(json.err.join("")).toBe("fixed   rename Read Me.md to Read-Me.md\nfixed   write netlify.toml\n");
  });

  it("without --fix changes nothing; with nothing to fix says so", async () => {
    const plain = io();
    const fs = new MemoryFileSystem({ "course.md": "# C\n" });
    expect(await runValidate(["--strict"], { ...plain.io, open: () => fs })).toBe(2);
    expect(fs.paths()).toEqual(["course.md"]);
    expect(fixSummary({ applied: [], skipped: [] })).toBe("Nothing to fix automatically.\n");
    expect(fixSummary({ applied: [], skipped: [{ op: { op: "move", from: "a", to: "b" }, reason: "b already exists" }] })).toBe("skipped rename a to b: b already exists\n");
  });
});
