import type { Finding, FileOp, RuleId } from "./finding.ts";
import { severityOf } from "./finding.ts";
import { messages } from "./messages.ts";
import { joinPath } from "./ports.ts";
import { netlifyToml } from "./templates.ts";
import type { CourseNode, CourseTree } from "./tree.ts";
import { extensionOf, isImage, kindOf } from "./tree.ts";
import { trimRuns } from "./trim.ts";

/**
 * The warning and info rules, V007-V012: a course that breaks them still builds, but something about it
 * will surprise the lecturer or their students. Each check is pure over the tree plus a text reader.
 */

const compositeKinds = ["unit", "side", "topic"];
const STEP = /^(\d{2})\.[^.].*\.md$/;
const MEGABYTE = 1024 * 1024;
export const IMAGE_LIMIT_BYTES = 2 * MEGABYTE;

function warning(rule: RuleId, path: string, message: string, extra: { suggestedName?: string; fix?: FileOp } = {}): Finding {
  return { rule, severity: severityOf(rule), path, message, ...extra };
}

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

/** Every folder the generator reads: the root and each typed folder below it, depth first. */
export function typedNodes(tree: CourseTree): CourseNode[] {
  const nodes: CourseNode[] = [];
  const visit = (node: CourseNode) => {
    nodes.push(node);
    for (const child of node.children) if (child.kind !== null) visit(child);
  };
  visit(tree);
  return nodes;
}

/** Lower-case, ASCII, hyphen-separated: "Week 3" becomes "week-3". */
export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
  return trimRuns(slug, "-");
}

/** A file name with its case and extension kept, accents dropped, and spaces and symbols turned to hyphens: "Café Notes & Links.pdf" becomes "Cafe-Notes-Links.pdf". */
export function fileSlug(name: string): string {
  const dot = name.lastIndexOf(".");
  const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  const clean = (text: string) =>
    trimRuns(
      text
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/-{2,}/g, "-"),
      "-"
    );
  return (clean(stem) || "file") + clean(extension);
}

const CLEAN_FOLDER = /^[a-z0-9][a-z0-9._-]*$/;
const CLEAN_FILE = /^[\x21-\x7e]+$/;

/** Whether any page names the file or folder, as written or URL-encoded ("Week 1 Slides.pdf", "Week%201%20Slides.pdf"). */
const mentionedIn = (pages: string[], name: string) => [name, encodeURI(name), name.replace(/ /g, "%20")].some((form) => pages.some((page) => page.includes(form)));

/**
 * V007: names that survive a round trip through Windows, macOS, git and a web server unchanged. A
 * rename of a file or folder is offered as a fix only when nothing links to the name, since a page that
 * links to it would break; images are never renamed, as pages show them by name.
 */
export async function checkNames(tree: CourseTree, read: (path: string) => Promise<string>): Promise<Finding[]> {
  const findings: Finding[] = [];
  const pages: string[] = [];
  for (const node of typedNodes(tree)) for (const file of node.files) if (extensionOf(file.name) === "md") pages.push(await read(file.path));
  for (const node of typedNodes(tree)) {
    if (node.path !== "" && !CLEAN_FOLDER.test(node.name)) {
      const suggestion = slugify(node.name);
      // Only a rename that keeps the folder's kind, and that no page links to, is safe to apply unasked.
      const fix: FileOp | undefined =
        kindOf(suggestion) === node.kind && !mentionedIn(pages, node.name) ? { op: "move", from: node.path, to: joinPath(parentOf(node.path), suggestion) } : undefined;
      findings.push(warning("V007", node.path, messages.folderName(node.name, suggestion), fix ? { suggestedName: suggestion, fix } : { suggestedName: suggestion }));
    }
    for (const file of node.files) {
      if (CLEAN_FILE.test(file.name)) continue;
      const suggestion = fileSlug(file.name);
      const extra =
        isImage(file.name) || mentionedIn(pages, file.name)
          ? { suggestedName: suggestion }
          : { suggestedName: suggestion, fix: { op: "move", from: file.path, to: joinPath(node.path, suggestion) } as FileOp };
      findings.push(warning("V007", file.path, messages.fileName(file.name, suggestion), extra));
    }
  }
  return findings;
}

/** The .md file whose first line becomes the card's title, read as the generator picks it. */
function descriptorOf(node: CourseNode): string | undefined {
  const md = node.files.filter((file) => extensionOf(file.name) === "md");
  if (node.kind === "course") return md.find((file) => file.name === "course.md")?.path;
  if (node.kind === "lab") return md.find((file) => STEP.test(file.name))?.path;
  return md[0]?.path;
}

/** The text after any front matter, with the blank lines that follow it dropped, as the generator's front-matter parser leaves it. */
export function bodyOf(text: string): string {
  const match = /^﻿?---\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  return match ? text.slice(match[0].length).replace(/^(?:[ \t]*\r?\n)+/, "") : text;
}

/** The title the generator reads: the body's first line, less one leading "#". */
export function titleOf(text: string): string {
  const first = bodyOf(text).split("\n")[0];
  return (first.startsWith("#") ? first.slice(1) : first).trim();
}

/** V008: every card has a title. (Its picture falls back to the kind's icon, so a missing image is not flagged.) */
export async function checkTitles(tree: CourseTree, read: (path: string) => Promise<string>): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const node of typedNodes(tree)) {
    const descriptor = descriptorOf(node);
    if (descriptor === undefined) continue;
    if (titleOf(await read(descriptor)) === "") findings.push(warning("V008", descriptor, messages.noTitle(descriptor.slice(descriptor.lastIndexOf("/") + 1))));
  }
  return findings;
}

/** The image sources a markdown file shows, outside code: ![alt](src) and <img src="...">. */
export function imageSources(markdown: string): string[] {
  const prose = markdown.replace(/^(```|~~~)[\s\S]*?^\1/gm, "").replace(/`[^`\n]*`/g, "");
  const sources: string[] = [];
  for (const match of prose.matchAll(/!\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+["'][^"']*["'])?\s*\)/g)) sources.push(match[1] ?? match[2]);
  for (const match of prose.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) sources.push(match[1]);
  return [...new Set(sources)];
}

/** Resolves a relative image source against the folder of the page that shows it; null for a web address or a path outside the course. */
export function resolveSource(folder: string, source: string): string | null {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(source)) return null;
  let decoded = source.replace(/[?#].*$/, "");
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // A stray % is part of the name.
  }
  const parts = folder === "" ? [] : folder.split("/");
  for (const part of decoded.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
}

/** Every file in the tree, typed folder or not (img/ folders included), by path. */
function fileIndex(tree: CourseTree): Map<string, number | undefined> {
  const index = new Map<string, number | undefined>();
  const visit = (node: CourseNode) => {
    for (const file of node.files) index.set(file.path, file.size);
    node.children.forEach(visit);
  };
  visit(tree);
  return index;
}

/** V009: the images a page or Marp deck shows exist and are small enough to load on a phone. */
export async function checkImages(tree: CourseTree, read: (path: string) => Promise<string>): Promise<Finding[]> {
  const findings: Finding[] = [];
  const index = fileIndex(tree);
  for (const node of typedNodes(tree)) {
    for (const file of node.files) {
      if (!["md", "marp"].includes(extensionOf(file.name))) continue;
      for (const source of imageSources(await read(file.path))) {
        const target = resolveSource(node.path, source);
        if (target === null) continue;
        if (!index.has(target)) findings.push(warning("V009", file.path, messages.imageMissing(source)));
        else {
          const size = index.get(target);
          if (size !== undefined && size >= IMAGE_LIMIT_BYTES) findings.push(warning("V009", file.path, messages.imageLarge(source, (size / MEGABYTE).toFixed(1))));
        }
      }
    }
  }
  return findings;
}

const TOPIC_NUMBER = /^topic[-_]?(\d+)/;

/** V010: sibling topics are numbered, and in sequence once sorted by name as the reader sorts them. */
export function checkTopicNumbers(tree: CourseTree): Finding[] {
  const findings: Finding[] = [];
  for (const node of typedNodes(tree)) {
    const topics = node.children.filter((child) => child.kind === "topic");
    if (topics.length < 2) continue;
    let previous: { name: string; number: number } | null = null;
    for (const topic of topics) {
      const match = TOPIC_NUMBER.exec(topic.name);
      if (match === null) {
        findings.push(warning("V010", topic.path, messages.topicUnnumbered(topic.name)));
        continue;
      }
      const number = Number(match[1]);
      if (previous !== null && number !== previous.number + 1) findings.push(warning("V010", topic.path, messages.topicOutOfSequence(previous.name, topic.name)));
      previous = { name: topic.name, number };
    }
  }
  return findings;
}

const PUBLISH = /^\s*publish\s*=\s*["']\.?\/?(?:json|html)\/?["']\s*(?:#.*)?$/;
const TABLE = /^\s*\[\s*([^\]]+?)\s*\]/;

/** Whether the production build publishes the generator's output: publish = "json" in the [build] table, not some other context's. */
function publishesOutput(toml: string): boolean {
  let table = "";
  for (const line of toml.split(/\r?\n/)) {
    const header = TABLE.exec(line);
    if (header) table = header[1];
    else if (table === "build" && PUBLISH.test(line)) return true;
  }
  return false;
}

/** V011: a netlify.toml that publishes what the generator writes. The fix writes the standard one when there is none. */
export async function checkNetlify(tree: CourseTree, read: (path: string) => Promise<string>): Promise<Finding[]> {
  const file = tree.files.find((candidate) => candidate.name === "netlify.toml");
  if (file === undefined) return [warning("V011", "netlify.toml", messages.netlifyMissing(), { fix: { op: "write", path: "netlify.toml", content: netlifyToml } })];
  return publishesOutput(await read(file.path)) ? [] : [warning("V011", file.path, messages.netlifyPublish())];
}

/** V012: a unit, side or topic with nothing in it yet. Fine while authoring, so only a note. */
export function checkEmpty(tree: CourseTree): Finding[] {
  return typedNodes(tree)
    .filter((node) => compositeKinds.includes(node.kind ?? "") && !node.children.some((child) => child.kind !== null))
    .map((node) => warning("V012", node.path, messages.empty(node.kind!)));
}
