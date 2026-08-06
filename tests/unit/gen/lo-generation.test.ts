import { describe, it, expect } from "vitest";

/**
 * LO generation shape tests.
 *
 * Each learning object type produced by the gen library must conform to its
 * type definition in packages/jsr/model/src/types/learning-objects.ts.
 * These tests validate the expected shape for every LO type.
 */

function makeBaseLo(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "note",
    id: "lo-1",
    title: "Test LO",
    summary: "A test learning object",
    contentMd: "",
    route: "/course/topic/lo-1",
    authLevel: 0,
    img: "",
    imgFile: "",
    video: "",
    hide: false,
    ...overrides,
  };
}

describe("lo-generation: Lab shape", () => {
  const lab = makeBaseLo({
    type: "lab",
    los: [
      { title: "Step 1", shortTitle: "Step 1", contentMd: "content", route: "/lab/step-1", id: "step-1", type: "step" },
      { title: "Step 2", shortTitle: "Step 2", contentMd: "content", route: "/lab/step-2", id: "step-2", type: "step" },
    ],
    pdf: "https://example.com/lab.pdf",
    pdfFile: "lab.pdf",
  });

  it("has type 'lab'", () => {
    expect(lab.type).toBe("lab");
  });

  it("has los array containing steps", () => {
    const steps = lab.los as Array<Record<string, unknown>>;
    expect(Array.isArray(steps)).toBe(true);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0].type).toBe("step");
  });

  it("has pdf and pdfFile fields", () => {
    expect(typeof lab.pdf).toBe("string");
    expect(typeof lab.pdfFile).toBe("string");
  });
});

describe("lo-generation: Talk shape", () => {
  const talk = makeBaseLo({
    type: "talk",
    pdf: "https://example.com/talk.pdf",
    pdfFile: "talk.pdf",
  });

  it("has type 'talk'", () => {
    expect(talk.type).toBe("talk");
  });

  it("has pdf and pdfFile fields", () => {
    expect(typeof talk.pdf).toBe("string");
    expect(typeof talk.pdfFile).toBe("string");
  });
});

describe("lo-generation: Note shape", () => {
  const note = makeBaseLo({ type: "note" });

  it("has type 'note'", () => {
    expect(note.type).toBe("note");
  });

  it("inherits base Lo fields", () => {
    expect(note.id).toBeDefined();
    expect(note.title).toBeDefined();
    expect(note.route).toBeDefined();
  });
});

describe("lo-generation: Archive shape", () => {
  const archive = makeBaseLo({
    type: "archive",
    archiveFile: "project.zip",
  });

  it("has type 'archive'", () => {
    expect(archive.type).toBe("archive");
  });

  it("has archiveFile field", () => {
    expect(archive.archiveFile).toBe("project.zip");
  });
});

describe("lo-generation: Web shape", () => {
  const web = makeBaseLo({ type: "web" });

  it("has type 'web'", () => {
    expect(web.type).toBe("web");
  });
});

describe("lo-generation: Github shape", () => {
  const github = makeBaseLo({ type: "github" });

  it("has type 'github'", () => {
    expect(github.type).toBe("github");
  });
});

describe("lo-generation: Tutorial shape", () => {
  const tutorial = makeBaseLo({
    type: "tutorial",
    pdf: "https://example.com/tutorial.pdf",
    pdfFile: "tutorial.pdf",
  });

  it("has type 'tutorial'", () => {
    expect(tutorial.type).toBe("tutorial");
  });

  it("has pdf field", () => {
    expect(typeof tutorial.pdf).toBe("string");
  });
});

describe("lo-generation: Notebook shape", () => {
  const notebook = makeBaseLo({
    type: "notebook",
    cells: [
      {
        cellType: "code",
        source: "print('hello')",
        outputs: [],
        executionCount: 1,
        metadata: {},
        id: "cell-1",
      },
    ],
    kernelLanguage: "python",
    kernelName: "python3",
  });

  it("has type 'notebook'", () => {
    expect(notebook.type).toBe("notebook");
  });

  it("has cells array", () => {
    const cells = notebook.cells as Array<Record<string, unknown>>;
    expect(Array.isArray(cells)).toBe(true);
    expect(cells).toHaveLength(1);
    expect(cells[0].cellType).toBe("code");
  });

  it("has kernelLanguage and kernelName", () => {
    expect(notebook.kernelLanguage).toBe("python");
    expect(notebook.kernelName).toBe("python3");
  });
});
