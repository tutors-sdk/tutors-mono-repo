/**
 * Turns a generated `tutors-lite` site into an LMS-uploadable SCORM package.
 *
 * The static site is used as-is rather than re-rendered: it already navigates with
 * relative links, so it works unchanged from a package root. This emitter only adds the
 * SCORM shell around it — the wrapper SCO, the run-time scripts, and the manifest.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Course, ScormVersion } from "@tutors/tutors-model-lib";
import { compressFolderToZip } from "../utils/file-utils.ts";
import { buildManifest } from "./manifest.ts";
import { SCORM_CONTENT_FOLDER } from "./package.ts";
import { buildPageScript, buildPageScriptTag, buildRuntimeScript, buildWrapperHtml, CONTENT_FOLDER, PAGE_FILE, RUNTIME_FILE, WRAPPER_FILE } from "./runtime.ts";

/**
 * Working directory of the template engine, written into the static output by
 * `downloadVentoTemplates`. Build scaffolding, not course content.
 */
const TEMPLATE_FOLDER = "vento";

export interface ScormExportOptions {
  version: ScormVersion;
  /** Manifest identifier; defaults to one derived from the course id. */
  identifier?: string;
  /** Full path of the `.zip` to write; defaults to `<destFolder>/<courseId>-scorm<version>.zip`. */
  outputPath?: string;
}

/** Every file beneath `folder`, as forward-slashed paths relative to it. */
function listFiles(folder: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...listFiles(path.join(folder, entry.name), relative));
    } else {
      files.push(relative);
    }
  }
  return files;
}

/**
 * Should visiting this page count towards completion?
 *
 * Wall pages (`talk.html`, `lab.html`, ...) sit at the site root beside `index.html` and
 * are indexes over content rather than content, so requiring a visit to each of them
 * before a course can be marked complete would be wrong.
 *
 * The pages of an imported SCORM package are excluded too. They are a third party's SCO
 * with its own run-time and its own idea of completion; Tutors tracks the page that frames
 * it, not the frames inside it, and injecting a script into someone else's content would
 * be both wrong and unwelcome.
 */
function isTrackablePage(relativePath: string): boolean {
  if (!relativePath.endsWith(".html")) return false;
  if (relativePath.includes(`/${SCORM_CONTENT_FOLDER}/`)) return false;
  const isAtRoot = !relativePath.includes("/");
  return !isAtRoot || relativePath === "index.html";
}

/**
 * Add the reporting script to a page.
 *
 * Inserted before `</body>` so it runs after the page has parsed. Pages without a closing
 * body tag are skipped rather than patched blindly.
 */
function injectPageScript(fullPath: string, relativePath: string, index: number): boolean {
  const html = fs.readFileSync(fullPath, "utf8");
  const marker = html.lastIndexOf("</body>");
  if (marker === -1) return false;
  const tag = `    ${buildPageScriptTag(relativePath, index)}\n`;
  fs.writeFileSync(fullPath, `${html.slice(0, marker)}${tag}${html.slice(marker)}`);
  return true;
}

/**
 * Package a static course as a single-SCO SCORM zip.
 *
 * @param course parsed course, for the manifest title and identifier
 * @param srcHtmlFolder the `tutors-lite` output directory
 * @param destFolder where to write the zip and stage the package
 * @returns the path of the written `.zip`
 */
export async function generateScormCourse(course: Course, srcHtmlFolder: string, destFolder: string, options: ScormExportOptions): Promise<string> {
  if (!fs.existsSync(srcHtmlFolder)) {
    throw new Error(`Cannot build a SCORM package: no static course found at ${srcHtmlFolder}`);
  }

  const suffix = options.version === "1.2" ? "scorm12" : "scorm2004";
  const outputPath = options.outputPath || path.join(destFolder, `${course.courseId || course.id || "course"}-${suffix}.zip`);
  const staging = path.join(destFolder, `.${suffix}-staging`);

  fs.rmSync(staging, { recursive: true, force: true });
  const contentFolder = path.join(staging, CONTENT_FOLDER);
  fs.mkdirSync(contentFolder, { recursive: true });
  fs.cpSync(srcHtmlFolder, contentFolder, { recursive: true });
  fs.rmSync(path.join(contentFolder, TEMPLATE_FOLDER), { recursive: true, force: true });

  // Sorted so that a page keeps the same bit across rebuilds; otherwise a republished
  // course would silently reinterpret every learner's existing suspend_data.
  const pages = listFiles(contentFolder).filter(isTrackablePage).sort();
  if (pages.length === 0) {
    throw new Error(`Cannot build a SCORM package: no HTML pages found in ${srcHtmlFolder}`);
  }

  pages.forEach((page, index) => injectPageScript(path.join(contentFolder, page), page, index));

  const runtimeOptions = { version: options.version, totalPages: pages.length };
  fs.writeFileSync(path.join(staging, WRAPPER_FILE), buildWrapperHtml(course.title?.trim() || "Tutors Course", runtimeOptions));
  fs.writeFileSync(path.join(staging, RUNTIME_FILE), buildRuntimeScript(runtimeOptions));
  fs.writeFileSync(path.join(staging, PAGE_FILE), buildPageScript());

  // Listed after the payload is complete, so the manifest describes what is actually there.
  const manifest = buildManifest(course, listFiles(staging), { version: options.version, identifier: options.identifier, launchFile: WRAPPER_FILE });
  fs.writeFileSync(path.join(staging, "imsmanifest.xml"), manifest);

  await compressFolderToZip(staging, outputPath);
  fs.rmSync(staging, { recursive: true, force: true });
  return outputPath;
}
