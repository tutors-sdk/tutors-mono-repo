import { imageTypes, loTypes } from "@tutors/tutors-model-lib";
import type { DirEntry, FileSystemPort } from "./ports.ts";
import { joinPath } from "./ports.ts";

export interface CourseFile {
  name: string;
  /** Relative to the course root, "/"-separated. */
  path: string;
  size?: number;
}

/** A folder of the course as Tutors reads it, before anything is pruned. */
export interface CourseNode {
  name: string;
  /** Relative to the course root, "/"-separated; "" for the root. */
  path: string;
  /**
   * The learning-object kind the folder's own name starts with ("book" reads as "lab"), "course" for
   * the root, or null when the name starts with no kind: the generator leaves such a folder, and
   * everything under it, out of the course.
   */
  kind: string | null;
  files: CourseFile[];
  children: CourseNode[];
}

export type CourseTree = CourseNode;

/** Longest first, so "paneltalk" wins over "talk" and "panelnote" over "note", as the generator matches. */
const kindsByLength = [...loTypes].filter((type) => type !== "course").sort((a, b) => b.length - a.length);

/** The kind a folder's own name declares, read exactly as the generator reads it (case-sensitive prefix). */
export function kindOf(folderName: string): string | null {
  const kind = kindsByLength.find((type) => folderName.startsWith(type));
  if (kind === undefined) return null;
  return kind === "book" ? "lab" : kind;
}

/** Folders the generator never reads: hidden folders and its own output folders. */
export function isSkippedFolder(name: string): boolean {
  return name.startsWith(".") || name === "json" || name === "html";
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot + 1).toLowerCase();
}

export function isImage(name: string): boolean {
  return imageTypes.includes(extensionOf(name));
}

const byName = (a: { name: string }, b: { name: string }) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** Reads a course folder through the port into a tree, sorted by name as the generator sorts. */
export async function buildCourseTree(fs: FileSystemPort, root = ""): Promise<CourseTree> {
  return await buildNode(fs, root, "", "course");
}

async function buildNode(fs: FileSystemPort, root: string, path: string, kind: string | null): Promise<CourseNode> {
  const entries: DirEntry[] = (await fs.list(joinPath(root, path))).sort(byName);
  const node: CourseNode = { name: path.slice(path.lastIndexOf("/") + 1), path, kind, files: [], children: [] };
  for (const entry of entries) {
    const childPath = joinPath(path, entry.name);
    if (entry.kind === "dir") {
      if (!isSkippedFolder(entry.name)) node.children.push(await buildNode(fs, root, childPath, kindOf(entry.name)));
    } else {
      node.files.push({ name: entry.name, path: childPath, size: entry.size });
    }
  }
  return node;
}

/** True when the folder, at any depth, holds only images: an img/ folder, which the generator copies as assets. */
export function holdsOnlyImages(node: CourseNode): boolean {
  return node.files.every((file) => isImage(file.name)) && node.children.every((child) => child.kind === null && holdsOnlyImages(child));
}
