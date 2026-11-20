import { MemoryFileSystem, validate, type Finding, type ValidateOptions } from "@tutors/course-rules";
import { unzipSync } from "fflate";

/**
 * The wizard's link to `tutors validate`: the same @tutors/course-rules core, run in the browser over an
 * in-memory course, so the reader says exactly what the CLI, CI and Tutors Studio say.
 */

/** Validates the files the wizard is about to download. */
export function checkGeneratedFiles(files: readonly { relativePath: string; content: string }[]): Promise<Finding[]> {
  return validate(new MemoryFileSystem(Object.fromEntries(files.map((file) => [file.relativePath, file.content]))));
}

/** Raised when an upload is not a zip of a course; its message is written for the instructor. */
export class UnreadableCourseError extends Error {}

export const MAX_ZIP_BYTES = 1024 * 1024 * 1024;
const MAX_TEXT_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 100_000;
const isLitter = (path: string) => path.endsWith("/") || path.startsWith("__MACOSX/") || path.split("/").pop() === ".DS_Store";
const isTextFile = (path: string) => /\.(?:md|marp|ya?ml|toml)$/i.test(path) || /(?:^|\/)(?:weburl|githubid|videoid)$/.test(path);

/** Index every resource, but only decompress text when the rules do not need binary contents. */
function readArchive(bytes: Uint8Array, textOnly: boolean) {
  if (bytes.byteLength > MAX_ZIP_BYTES) throw new UnreadableCourseError("This .zip is larger than 1 GB. Leave out generated output and dependency folders, then try again.");
  const sizes = new Map<string, number>();
  let entries: Record<string, Uint8Array>;
  let expanded = 0;
  try {
    entries = unzipSync(bytes, {
      filter: (file) => {
        const path = file.name.replaceAll("\\", "/");
        if (isLitter(path)) return false;
        if (path.split("/").includes("..") || path.startsWith("/")) throw new UnreadableCourseError("This .zip contains paths outside the course folder. Zip the course folder again.");
        if (sizes.has(path)) throw new UnreadableCourseError("This .zip contains duplicate file paths. Zip the course folder again.");
        sizes.set(path, file.originalSize);
        if (sizes.size > MAX_FILES) throw new UnreadableCourseError("This .zip holds more than 100,000 files. Leave out generated output and dependency folders, then try again.");
        const read = !textOnly || isTextFile(path);
        if (read) expanded += file.originalSize;
        if (expanded > MAX_TEXT_BYTES) throw new UnreadableCourseError("This .zip expands beyond 100 MB of readable files. Leave out generated output and dependency folders, then try again.");
        return read;
      }
    });
  } catch (error) {
    if (error instanceof UnreadableCourseError) throw error;
    throw new UnreadableCourseError("This file isn't a .zip that can be opened. Zip the course folder and try again.");
  }
  if (!sizes.size) throw new UnreadableCourseError("This .zip is empty. Zip the course folder and try again.");
  const tops = new Set([...sizes.keys()].map(path => path.includes("/") ? path.slice(0, path.indexOf("/")) : ""));
  const [top] = tops;
  const prefix = tops.size === 1 && top !== "" ? `${top}/` : "";
  const contents = new Map(Object.entries(entries).map(([path, bytes]) => [path.replaceAll("\\", "/"), bytes]));
  const files = Object.fromEntries([...sizes.keys()].map(path => [path.slice(prefix.length), contents.get(path) ?? new Uint8Array()]));
  return { files, sizes: new Map([...sizes].map(([path, size]) => [path.slice(prefix.length), size])) };
}

/** Files from a small archive, retaining the reader's existing helper contract. */
export function courseFromZip(bytes: Uint8Array): Record<string, Uint8Array> {
  return readArchive(bytes, false).files;
}

/** Source rules inspect binary resources by path and size, without inflating PDFs, videos or archives. */
class ZipFileSystem extends MemoryFileSystem {
  private readonly sizes: Map<string, number>;
  constructor(bytes: Uint8Array) {
    const { files, sizes } = readArchive(bytes, true);
    super(files);
    this.sizes = sizes;
  }
  override async list(dir: string) {
    return (await super.list(dir)).map(entry => entry.kind === "file" ? { ...entry, size: this.sizes.get(dir ? `${dir}/${entry.name}` : entry.name) } : entry);
  }
  override read(path: string): Promise<Uint8Array> {
    // Fail explicitly if a future rule needs binary contents instead of silently checking an empty placeholder.
    if (this.sizes.has(path) && !isTextFile(path)) return Promise.reject(new UnreadableCourseError(`A source rule tried to inspect binary contents at ${path}; this check cannot be completed.`));
    return super.read(path);
  }
}

/** Validate the complete source tree, including resource sizes, with only source text held expanded. */
export function checkZip(bytes: Uint8Array, options: ValidateOptions = {}): Promise<Finding[]> {
  return validate(new ZipFileSystem(bytes), "", options);
}

/** "2 errors, 1 warning", or the all-clear: the headline above a list of findings. */
export function findingsHeadline(findings: readonly Finding[]): string {
  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warn").length;
  if (errors + warnings === 0) return "No problems found.";
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return `${plural(errors, "error")}, ${plural(warnings, "warning")}.${errors > 0 ? " Fix the errors before publishing." : ""}`;
}
