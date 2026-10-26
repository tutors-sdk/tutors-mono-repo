import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyAssets, parseCourse } from "../../../packages/jsr/gen/src/tutors.ts";
import type { TutorsJsonCourse, TutorsJsonLo } from "../../../packages/jsr/types/src/tutors-json.ts";
import { descendants } from "../../support/synthetic-course.ts";

/**
 * The corners of course-builder.ts and resource-builder.ts the synthetic corpus course does not reach:
 * Marp talks, notebook outputs and fallbacks, talks with both a PDF and a video, folders the generator
 * skips, and the ignore list. Each course is a few files written to a temp folder, built as the CLI
 * builds a lecturer's folder.
 */
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function folder(files: Record<string, string | Buffer>): string {
  const root = join(mkdtempSync(join(tmpdir(), "tutors-builder-")), "course").replaceAll("\\", "/");
  roots.push(dirname(root));
  for (const [path, contents] of Object.entries({ "course.md": "# Course\nA course\n", ...files })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  return root;
}

function build(files: Record<string, string | Buffer>): { root: string; json: TutorsJsonCourse; byId: (id: string) => TutorsJsonLo } {
  const root = folder(files);
  const [course] = parseCourse(root, true);
  const json = JSON.parse(JSON.stringify(course)) as TutorsJsonCourse;
  const byId = (id: string) => (descendants(json) as TutorsJsonLo[]).find((lo) => lo.id === id)!;
  return { root, json, byId };
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("buildCourse: talks", () => {
  it("a talk with a PDF and a video keeps its own route", () => {
    const { byId } = build({ "topic-1/topic.md": "# T\n", "topic-1/talk-1/talk.md": "# Talk\n", "topic-1/talk-1/talk.pdf": "%PDF", "topic-1/talk-1/videoid": "abc123" });
    const talk = byId("talk-1");
    expect(talk.video).toBe("/video/{{COURSEURL}}/topic-1/talk-1/abc123");
    expect(talk.route).toBe("/talk/{{COURSEURL}}/topic-1/talk-1");
  });

  it("a talk with neither PDF nor video keeps its own route and its markdown", () => {
    const talk = build({ "topic-1/topic.md": "# T\n", "topic-1/talk-1/talk.md": "# Talk\nAbout\n" }).byId("talk-1");
    expect(talk.route).toBe("/talk/{{COURSEURL}}/topic-1/talk-1");
    expect(talk.contentMd).toBe("# Talk\nAbout\n");
  });

  it("a Marp talk takes its content from the .marp file and merges its front matter under the talk's", () => {
    const { byId } = build({
      "topic-1/topic.md": "# T\n",
      "topic-1/talk-1/talk.md": "---\nlayout: talk\n---\n# Talk\nSummary\n",
      "topic-1/talk-1/slides.marp": "---\nmarp: true\nlayout: slides\n---\n# Slide one\n\n---\n\n# Slide two\n"
    });
    const talk = byId("talk-1");
    expect(talk.contentMd).toBe("# Slide one\n\n---\n\n# Slide two\n");
    expect(talk.frontMatter).toEqual({ marp: true, layout: "talk" });
    expect(talk.title).toBe("Talk");
  });

  it("a panel talk is built as a talk; a tutorial gets pdf fields", () => {
    const { byId } = build({
      "topic-1/topic.md": "# T\n",
      "topic-1/paneltalk-1/talk.md": "# Panel\n",
      "topic-1/paneltalk-1/videoid": "xyz",
      "topic-1/tutorial-1/sheet.md": "# Sheet\n",
      "topic-1/tutorial-1/sheet.pdf": "%PDF"
    });
    expect(byId("paneltalk-1").route).toBe("/video/{{COURSEURL}}/topic-1/paneltalk-1/xyz");
    expect(byId("tutorial-1").pdfFile).toBe("sheet.pdf");
  });
});

describe("buildCourse: notebooks", () => {
  const notebook = (nb: unknown, extra: Record<string, string | Buffer> = {}) =>
    build({ "topic-1/topic.md": "# T\n", "topic-1/notebook-1/notebook.md": "# NB\n", "topic-1/notebook-1/nb.ipynb": JSON.stringify(nb), ...extra }).byId("notebook-1");

  it("maps every output field and joins array text and data", () => {
    const nb = notebook({
      metadata: { kernelspec: { language: "r", display_name: "R 4" } },
      cells: [
        {
          cell_type: "code",
          id: "k",
          execution_count: 3,
          metadata: { tags: ["x"] },
          source: ["a <- 1\n", "a"],
          outputs: [
            { output_type: "stream", name: "stdout", text: ["one\n", "two\n"] },
            { output_type: "execute_result", execution_count: 3, data: { "text/plain": ["[1]", " 1"], "text/html": "<b>1</b>" } },
            { output_type: "error", traceback: ["Error", "at line 1"] },
            { output_type: "display_data", text: "plain" }
          ]
        }
      ]
    });
    expect(nb.kernelLanguage).toBe("r");
    expect(nb.kernelName).toBe("R 4");
    expect(nb.cells).toEqual([
      {
        cellType: "code",
        source: "a <- 1\na",
        executionCount: 3,
        metadata: { tags: ["x"] },
        id: "k",
        outputs: [
          { outputType: "stream", name: "stdout", text: "one\ntwo\n" },
          { outputType: "execute_result", executionCount: 3, data: { "text/plain": "[1] 1", "text/html": "<b>1</b>" } },
          { outputType: "error", traceback: ["Error", "at line 1"] },
          { outputType: "display_data", text: "plain" }
        ]
      }
    ]);
  });

  it("falls back for a notebook missing kernel, cells, outputs, ids, source and metadata", () => {
    const nb = notebook({ metadata: { language_info: { name: "julia" } }, cells: [{ cell_type: "raw" }, { cell_type: "markdown", source: "x", outputs: [] }] });
    expect(nb.kernelLanguage).toBe("julia");
    expect(nb.kernelName).toBe("julia");
    expect(nb.cells).toEqual([
      { cellType: "raw", source: "", outputs: [], executionCount: null, metadata: {}, id: "cell-0" },
      { cellType: "markdown", source: "x", outputs: [], executionCount: null, metadata: {}, id: "cell-1" }
    ]);
    expect(notebook({}).kernelLanguage).toBe("python");
    expect(notebook({ metadata: {} }).kernelLanguage).toBe("python");
    expect(notebook({}).cells).toEqual([]);
  });

  it("a notebook folder without an .ipynb gets no cells", () => {
    const nb = build({ "topic-1/topic.md": "# T\n", "topic-1/notebook-1/notebook.md": "# NB\n" }).byId("notebook-1");
    expect(nb).not.toHaveProperty("cells");
    expect(nb).not.toHaveProperty("kernelLanguage");
  });

  it("images a notebook from img/main, else from its own folder", () => {
    expect(notebook({}, { "topic-1/notebook-1/img/main.png": PNG }).imgFile).toBe("img/main.png");
    const own = notebook({}, { "topic-1/notebook-1/cover.png": PNG });
    expect(own.img).toBe("https://{{COURSEURL}}/topic-1/notebook-1/cover.png");
    expect(own.imgFile).toBe("cover.png");
  });
});

describe("buildCourse: whiteboards", () => {
  it("a whiteboard without an .excalidraw file has no excalidraw fields", () => {
    const board = build({ "topic-1/topic.md": "# T\n", "topic-1/whiteboard-1/board.md": "# Board\n" }).byId("whiteboard-1");
    expect(board).not.toHaveProperty("excalidraw");
    expect(board).not.toHaveProperty("excalidrawFile");
  });
});

describe("buildCourse: the course root", () => {
  it("hides exactly the topics properties.yaml lists under ignore, and nothing without the list", () => {
    const files = { "topic-1/topic.md": "# One\n", "topic-2/topic.md": "# Two\n", "topic-3/topic.md": "# Three\n" };
    const ignoring = build({ ...files, "properties.yaml": "ignore:\n  - topic-1\n  - topic-3\n" }).json;
    expect(ignoring.los.map((lo) => [lo.id, lo.hide])).toEqual([
      ["topic-1", true],
      ["topic-2", false],
      ["topic-3", true]
    ]);
    const plain = build({ ...files, "properties.yaml": "credits: x\n" }).json;
    expect(plain.properties).toEqual({ credits: "x" });
    expect(plain.los.every((lo) => lo.hide === false)).toBe(true);
  });

  it("leaves out properties, calendar and enrollment when the files are absent", () => {
    const { json } = build({ "topic-1/topic.md": "# T\n" });
    expect(json).not.toHaveProperty("properties");
    expect(json).not.toHaveProperty("calendar");
    expect(json).not.toHaveProperty("enrollment");
  });

  it("copies calendar.yaml and enrollment.yaml when present", () => {
    const { json } = build({ "calendar.yaml": "title: S1\n", "enrollment.yaml": "students: []\n" });
    expect(json.calendar).toEqual({ title: "S1" });
    expect(json.enrollment).toEqual({ students: [] });
  });

  it("prints the tree, indented by depth, unless silent", () => {
    const write = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const root = folder({ "topic-1/topic.md": "# Topic\n", "topic-1/unit-1/unit.md": "# Unit\n", "topic-1/unit-1/note-1/note.md": "# Note\n" });
    parseCourse(root);
    const lines = write.mock.calls.map(([text]) => String(text));
    expect(lines).toEqual([": course : Course\n", "--: topic-1 : Topic\n", "----: unit-1 : Unit\n", "------: note-1 : Note\n"]);
    write.mockClear();
    parseCourse(root, true);
    expect(write).not.toHaveBeenCalled();
  });
});

describe("buildTree: what the generator reads", () => {
  it("skips dot folders and json/html output folders, prunes folders of no known kind, and sorts by name", () => {
    const { json } = build({
      "topic-2/topic.md": "# Two\n",
      "topic-1/topic.md": "# One\n",
      "topic-1/note-b/note.md": "# B\n",
      "topic-1/note-a/note.md": "# A\n",
      "drafts/topic-9/topic.md": "# Under drafts\n",
      ".git/topic-8/topic.md": "# In .git\n",
      "json/topic-7/topic.md": "# Old output\n",
      "html/topic-6/topic.md": "# Old output\n"
    });
    expect(json.los.map((lo) => lo.id)).toEqual(["topic-1", "topic-2"]);
    expect(json.los[0].los!.map((lo) => lo.id)).toEqual(["note-a", "note-b"]);
  });

  it("leaves out a folder of no kind inside a topic or unit, but still copies its assets (#424)", () => {
    const root = folder({
      "topic-1/topic.md": "# T\n",
      "topic-1/drafts/readme.md": "# Draft\n",
      "topic-1/drafts/sketch.png": PNG,
      "topic-1/unit-1/unit.md": "# U\n",
      "topic-1/unit-1/old/readme.md": "# Old\n",
      "topic-1/unit-1/note-1/note.md": "# N\n",
      "topic-1/unit-1/lab-1/01.Step.md": "# Step\n",
      "topic-1/unit-1/lab-1/img/shot.png": PNG
    });
    const [course, lr] = parseCourse(root, true);
    const json = JSON.parse(JSON.stringify(course)) as TutorsJsonCourse;
    expect(json.los[0].los!.map((lo) => lo.id)).toEqual(["unit-1"]);
    expect(json.los[0].los![0].los!.map((lo) => lo.id)).toEqual(["lab-1", "note-1"]);
    const out = join(root, "json");
    copyAssets(lr, out);
    expect(existsSync(join(out, "topic-1/drafts/sketch.png"))).toBe(true);
    expect(existsSync(join(out, "topic-1/unit-1/lab-1/img/shot.png"))).toBe(true);
  });

  it("a book folder is a lab", () => {
    expect(build({ "topic-1/topic.md": "# T\n", "topic-1/book-1/01.Step.md": "# Step\n" }).byId("book-1").type).toBe("lab");
  });

  it("copyAssets copies the course's assets and nothing from pruned folders", () => {
    const root = folder({
      "course.png": PNG,
      "topic-1/topic.md": "# T\n",
      "topic-1/note-1/note.md": "# N\n",
      "topic-1/note-1/pic.png": PNG,
      "topic-1/note-1/notes.txt": "not an asset",
      "drafts/sketch.png": PNG
    });
    const [, lr] = parseCourse(root, true);
    const out = join(root, "json");
    copyAssets(lr, out);
    expect(existsSync(join(out, "course.png"))).toBe(true);
    expect(existsSync(join(out, "topic-1/note-1/pic.png"))).toBe(true);
    expect(existsSync(join(out, "topic-1/note-1/notes.txt"))).toBe(false);
    expect(existsSync(join(out, "drafts"))).toBe(false);
  });
});
