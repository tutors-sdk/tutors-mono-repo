import { MemoryFileSystem, validate, type Finding } from "@tutors/course-rules";
import type { GeneratedFile } from "@tutors/tutors-create/generate";
import { unzipSync } from "fflate";

/**
 * The wizard's link to `tutors validate`: the same @tutors/course-rules core, run in the browser over an
 * in-memory course, so the reader says exactly what the CLI, CI and Tutors Studio say.
 */

/** Validates the files the wizard is about to download. */
export function checkGeneratedFiles(files: readonly GeneratedFile[]): Promise<Finding[]> {
  return validate(new MemoryFileSystem(Object.fromEntries(files.map((file) => [file.relativePath, file.content]))));
}

/** Raised when an upload is not a zip of a course; its message is written for the instructor. */
export class UnreadableCourseError extends Error {}

const isLitter = (path: string) => path.endsWith("/") || path.startsWith("__MACOSX/") || path.split("/").pop() === ".DS_Store";

/**
 * A course folder's files from a .zip. A zip made by zipping the folder holds one top-level folder (the
 * wizard's own download does): that folder is taken as the course root.
 */
export function courseFromZip(bytes: Uint8Array): Record<string, Uint8Array> {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw new UnreadableCourseError("This file isn't a .zip that can be opened. Zip the course folder and try again.");
  }
  const files = Object.entries(entries).filter(([path]) => !isLitter(path));
  if (files.length === 0) throw new UnreadableCourseError("This .zip is empty. Zip the course folder and try again.");
  const tops = new Set(files.map(([path]) => (path.includes("/") ? path.slice(0, path.indexOf("/")) : "")));
  const [top] = tops;
  const prefix = tops.size === 1 && top !== "" ? `${top}/` : "";
  return Object.fromEntries(files.map(([path, content]) => [path.slice(prefix.length), content]));
}

/** Validates a course uploaded as a .zip. */
export function checkZip(bytes: Uint8Array): Promise<Finding[]> {
  return validate(new MemoryFileSystem(courseFromZip(bytes)));
}

/** "2 errors, 1 warning", or the all-clear: the headline above a list of findings. */
export function findingsHeadline(findings: readonly Finding[]): string {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warn").length;
  if (errors + warnings === 0) return "No problems found.";
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(errors, "error")}, ${plural(warnings, "warning")}.${errors > 0 ? " Fix the errors before publishing." : ""}`;
}
