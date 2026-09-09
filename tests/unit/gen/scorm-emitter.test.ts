import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { generateScormCourse } from "../../../packages/jsr/gen/src/scorm/emitter.ts";
import { CONTENT_FOLDER, PAGE_FILE, RUNTIME_FILE, WRAPPER_FILE } from "../../../packages/jsr/gen/src/scorm/runtime.ts";
import { SCORM_CONTENT_FOLDER } from "../../../packages/jsr/gen/src/scorm/package.ts";
import { unzip } from "../../../packages/jsr/gen/src/scorm/zip.ts";
import type { Course } from "../../../packages/jsr/model/src/types/learning-objects.ts";

const course = { title: "Smoke Course", courseId: "smoke", id: "smoke" } as Course;

function page(body: string): string {
  return `<!DOCTYPE html><html><head><title>${body}</title></head><body><h1>${body}</h1></body></html>`;
}

function write(file: string, contents: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

describe("generateScormCourse", () => {
  let scratch = "";
  let entries: Record<string, string> = {};

  const text = (name: string) => entries[name] ?? "";

  beforeAll(async () => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-scorm-emit-"));
    const site = path.join(scratch, "html");

    write(path.join(site, "index.html"), page("Home"));
    // Wall pages sit at the site root beside index.html and index content rather than being it.
    write(path.join(site, "talk.html"), page("Talks"));
    write(path.join(site, "lab.html"), page("Labs"));
    write(path.join(site, "topic-01", "index.html"), page("Topic One"));
    write(path.join(site, "topic-01", "talk-01", "index.html"), page("Talk One"));
    write(path.join(site, "topic-01", "scorm-quiz", "index.html"), page("Vendor Quiz"));
    // A third party's SCO, framed by the page above; it has its own run-time.
    write(path.join(site, "topic-01", "scorm-quiz", SCORM_CONTENT_FOLDER, "index.html"), page("Vendor content"));
    write(path.join(site, "style.css"), "body {}");
    // Template working directory, written by the generator; build scaffolding, not content.
    write(path.join(site, "vento", "main.vto"), "{{ title }}");

    const zip = await generateScormCourse(course, site, scratch, { version: "1.2" });
    const decoder = new TextDecoder();
    entries = Object.fromEntries(Object.entries(unzip(new Uint8Array(fs.readFileSync(zip)))).map(([name, data]) => [name, decoder.decode(data)]));
  });

  afterAll(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("names the zip after the course and the profile", () => {
    expect(fs.existsSync(path.join(scratch, "smoke-scorm12.zip"))).toBe(true);
  });

  it("packages the SCORM shell at the root and the site beneath it", () => {
    expect(Object.keys(entries)).toEqual(expect.arrayContaining(["imsmanifest.xml", WRAPPER_FILE, RUNTIME_FILE, PAGE_FILE, `${CONTENT_FOLDER}/index.html`]));
  });

  it("declares every packaged file in the manifest", () => {
    Object.keys(entries)
      .filter((name) => name !== "imsmanifest.xml")
      .forEach((name) => expect(text("imsmanifest.xml")).toContain(`<file href="${name}" />`));
  });

  it("launches the wrapper rather than the course's own home page", () => {
    expect(text("imsmanifest.xml")).toContain(`href="${WRAPPER_FILE}"`);
  });

  it("injects the reporting script into content pages", () => {
    expect(text(`${CONTENT_FOLDER}/index.html`)).toContain(`data-scorm-index="0"`);
    expect(text(`${CONTENT_FOLDER}/topic-01/talk-01/index.html`)).toContain(`data-scorm-path="topic-01/talk-01/index.html"`);
  });

  it("injects the script before the closing body tag, so the page has parsed", () => {
    const home = text(`${CONTENT_FOLDER}/index.html`);
    expect(home.indexOf(PAGE_FILE)).toBeLessThan(home.indexOf("</body>"));
  });

  it("does not count wall pages towards completion", () => {
    expect(text(`${CONTENT_FOLDER}/talk.html`)).not.toContain(PAGE_FILE);
    expect(text(`${CONTENT_FOLDER}/lab.html`)).not.toContain(PAGE_FILE);
  });

  it("does not inject into an imported third-party SCO", () => {
    expect(text(`${CONTENT_FOLDER}/topic-01/scorm-quiz/${SCORM_CONTENT_FOLDER}/index.html`)).not.toContain(PAGE_FILE);
    // The Tutors page that frames it is still tracked.
    expect(text(`${CONTENT_FOLDER}/topic-01/scorm-quiz/index.html`)).toContain(PAGE_FILE);
  });

  it("sizes the progress denominator to the trackable pages only", () => {
    expect(text(RUNTIME_FILE)).toContain("var TOTAL_PAGES = 4;");
  });

  it("gives each page a stable index, so a rebuild does not reinterpret saved progress", () => {
    // Sorted page order: index.html, topic-01/index.html, topic-01/scorm-quiz/index.html, topic-01/talk-01/index.html
    expect(text(`${CONTENT_FOLDER}/topic-01/index.html`)).toContain(`data-scorm-index="1"`);
    expect(text(`${CONTENT_FOLDER}/topic-01/scorm-quiz/index.html`)).toContain(`data-scorm-index="2"`);
    expect(text(`${CONTENT_FOLDER}/topic-01/talk-01/index.html`)).toContain(`data-scorm-index="3"`);
  });

  it("leaves the template working directory out of the package", () => {
    expect(Object.keys(entries).some((name) => name.includes("vento"))).toBe(false);
  });

  it("removes its staging directory", () => {
    expect(fs.existsSync(path.join(scratch, ".scorm12-staging"))).toBe(false);
  });
});

describe("generateScormCourse: unusable input", () => {
  let scratch = "";

  beforeAll(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-scorm-emit-bad-"));
  });

  afterAll(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it("refuses to package a course that has not been generated", () => {
    return expect(generateScormCourse(course, path.join(scratch, "missing"), scratch, { version: "1.2" })).rejects.toThrow(/no static course found/);
  });

  it("refuses to package a site with no trackable pages", () => {
    const site = path.join(scratch, "empty");
    write(path.join(site, "style.css"), "body {}");
    return expect(generateScormCourse(course, site, scratch, { version: "2004" })).rejects.toThrow(/no HTML pages found/);
  });
});
