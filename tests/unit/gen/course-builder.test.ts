import { describe, expect, it } from "vitest";
import { preOrder } from "../../../packages/jsr/model/src/types/type-utils.ts";
import type { TutorsJsonLo } from "../../../packages/jsr/types/src/tutors-json.ts";
import { descendants, syntheticTutorsJson } from "../../support/synthetic-course.ts";

/**
 * buildCourse (packages/jsr/gen/src/services/course-builder.ts) over the synthetic corpus course, read
 * back as the tutors.json the CLI writes. One test per thing a kind adds, so a change to a builder
 * function fails here with the kind's name rather than only as a differential hunk.
 */
const { json } = syntheticTutorsJson();
const all = descendants(json) as TutorsJsonLo[];
const lo = (id: string, parent?: string): TutorsJsonLo => {
  const scope = parent ? (descendants(all.find((p) => p.id === parent)!) as TutorsJsonLo[]) : all;
  const found = scope.filter((candidate) => candidate.id === id);
  expect(found, `one learning object ${id}${parent ? ` in ${parent}` : ""}`).toHaveLength(1);
  return found[0];
};
const course = "{{COURSEURL}}";

describe("buildCourse: the course", () => {
  it("is the root at route / with the title and summary from course.md", () => {
    expect(json.type).toBe("course");
    expect(json.route).toBe("/");
    expect(json.id).toBe("synthetic-course");
    expect(json.title).toBe("Cúrsa Tagartha — 参考コース ✓");
    expect(json.summary).toContain("A synthetic course for the generator differential test.");
    expect(json.img).toBe(`https://${course}/course.png`);
    expect(json.imgFile).toBe("course.png");
  });

  it("leaves authLevel at 0 and hide false: the reader applies properties.yaml", () => {
    for (const each of [json, ...all.filter((child) => child.id !== "topic-09-hidden" && child.type !== "step")]) {
      expect(each.authLevel, each.id).toBe(0);
      expect(each.hide, each.id).toBe(false);
    }
  });
});

describe("buildCourse: composites", () => {
  it("routes topics by folder and units and sides to their topic, with a trailing slash", () => {
    expect(lo("topic-01-typical").route).toBe(`/topic/${course}/topic-01-typical`);
    expect(lo("unit-1").route).toBe(`/topic/${course}/topic-01-typical/`);
    expect(lo("side-unit").route).toBe(`/topic/${course}/topic-02-side/`);
  });

  it("keeps an empty topic with no children", () => {
    expect(lo("topic-05-empty").los).toEqual([]);
  });

  it("orders each composite's children by kind, units first, in model-lib's preOrder", () => {
    for (const composite of [json, ...all.filter((child) => ["topic", "unit", "side"].includes(child.type))]) {
      const ranks = (composite.los as TutorsJsonLo[]).map((child) => preOrder.get(child.type)!);
      expect(ranks, composite.id).toEqual([...ranks].sort((a, b) => a - b));
    }
    expect(lo("topic-01-typical").los!.map((child) => child.id)).toEqual(["unit-1", "unit-2"]);
    expect(lo("unit-1").los!.map((child) => child.type)).toEqual(["talk", "talk", "talk", "lab"]);
  });
});

describe("buildCourse: simple learning objects", () => {
  it("talk with a PDF: routed to the talk, pdf and pdfFile set", () => {
    const talk = lo("talk-1");
    expect(talk.route).toBe(`/talk/${course}/topic-01-typical/unit-1/talk-1`);
    expect(talk.pdf).toBe(`https://${course}/topic-01-typical/unit-1/talk-1/talk.pdf`);
    expect(talk.pdfFile).toBe("talk.pdf");
  });

  it("talk with only a video: routed to the video, pdf fields empty", () => {
    const talk = lo("talk-2");
    expect(talk.video).toBe(`/video/${course}/topic-01-typical/unit-1/talk-2/x09E7b2ESE8`);
    expect(talk.route).toBe(talk.video);
    expect(talk.pdf).toBe("");
    expect(talk.pdfFile).toBe("");
    expect(talk.videoids).toEqual({ videoid: "x09E7b2ESE8", videoIds: [{ service: "youtube", id: "x09E7b2ESE8" }] });
  });

  it("talk on Panopto: the service id becomes the video and is listed in videoIds", () => {
    const talk = lo("talk-3");
    expect(talk.route).toBe(`/video/${course}/topic-01-typical/unit-1/talk-3/3f9c2d6e-1a2b-4c3d-9e8f-0a1b2c3d4e5f`);
    expect(talk.videoids.videoIds).toEqual([{ service: "panopto", id: "3f9c2d6e-1a2b-4c3d-9e8f-0a1b2c3d4e5f" }]);
  });

  it("lab with img/main: titled by its first step, imaged from img/, no pdf fields", () => {
    const lab = lo("book-a");
    expect(lab.title).toBe("Lab-1");
    expect(lab.img).toBe(`https://${course}/topic-01-typical/unit-1/book-a/img/main.png`);
    expect(lab.imgFile).toBe("img/main.png");
    expect(lab).not.toHaveProperty("pdf");
    expect(lab.los!.map((step) => step.title)).toEqual(["Lab 1: Setup", "Install", "Ünïcödé step — ✓"]);
  });

  it("lab without img/main: keeps its folder title and image and gains pdf fields", () => {
    const lab = lo("book-b");
    expect(lab.title).toBe("Lab 2");
    expect(lab.img).toBe(`https://${course}/topic-02-side/side-unit/book-b/lab.png`);
    expect(lab.imgFile).toBe("lab.png");
    expect(lab.pdf).toBe("");
    expect(lab.pdfFile).toBe("");
  });

  it("tutorial: pdf and pdfFile from its PDF", () => {
    const tutorial = lo("tutorial-1");
    expect(tutorial.pdf).toBe(`https://${course}/topic-01-typical/unit-2/tutorial-1/problem-sheet.pdf`);
    expect(tutorial.pdfFile).toBe("problem-sheet.pdf");
  });

  it("web and github: routed to the link in weburl and githubid", () => {
    expect(lo("web-1").route).toBe("https://tutors.dev/");
    expect(lo("github-1").route).toBe("https://github.com/tutors-sdk/tutors");
  });

  it("archive: archiveFile names the zip, the route stays in the course", () => {
    const archive = lo("archive");
    expect(archive.archiveFile).toBe("archive.zip");
    expect(archive.route).toBe(`/archive/${course}/topic-01-typical/unit-2/archive`);
  });

  it("note: no fields beyond the base", () => {
    expect(Object.keys(lo("note-1", "unit-2")).sort()).toEqual(
      ["authLevel", "contentMd", "frontMatter", "hide", "id", "img", "imgFile", "route", "summary", "title", "type", "video", "videoids"].sort()
    );
  });

  it("panel talk keeps its pdf; panel video is routed to its video", () => {
    expect(lo("paneltalk").pdf).toBe(`https://${course}/topic-03-panels/paneltalk/talk.pdf`);
    const heanet = lo("panelvideo-heanet");
    expect(heanet.route).toBe(heanet.video);
    expect(heanet.route).toBe(`/video/${course}/topic-03-panels/panelvideo-heanet/7e4f1e9afedb40d5996d0703702eaaa4`);
  });

  it("podcast: the episode from service=id in the episode file", () => {
    expect(lo("podcast-1").episode).toEqual({ service: "spotify", id: "722LWsc3uWc0zAqUHP8QHs" });
  });

  it("notebook: cells, kernel language and name from the .ipynb", () => {
    const notebook = lo("notebook-a");
    expect(notebook.kernelLanguage).toBe("python");
    expect(notebook.kernelName).toBeTruthy();
    expect(notebook.cells!.length).toBeGreaterThan(0);
    expect(notebook.cells![0]).toMatchObject({ cellType: "markdown", source: "# Basics\nSome text", outputs: [], executionCount: null, id: "cell-0" });
  });

  it("whiteboard: the excalidraw file by name and by course URL", () => {
    const board = lo("whiteboard-1");
    expect(board.excalidrawFile).toBe("board.excalidraw");
    expect(board.excalidraw).toBe(`https://${course}/topic-04-media/whiteboard-1/board.excalidraw`);
  });
});
