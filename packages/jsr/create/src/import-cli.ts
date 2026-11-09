import * as fs from "node:fs";
import * as path from "node:path";
import { proposeShape, validate, type ImportFile, type ShapeProposal } from "@tutors/course-rules";
import { diskCourse } from "./course-fs.ts";
import { importLayout, type ImportLayout } from "./import-course.ts";
import { CourseDirectoryExistsError } from "./scaffolder.ts";
import { defaultSpec, slugify, type CourseSpec } from "./types.ts";

export const importUsage = "Usage: tutors import <folder> --name <course name> [--start YYYY-MM-DD] [--lecturer <name>] [--out <folder>]\n";

export interface ImportArgs {
  source: string;
  spec: CourseSpec;
  start?: string;
  outputDir: string;
}

/** Reads `import <folder> --name ...`. Returns a message when the arguments are wrong. */
export function parseImportArgs(args: readonly string[]): ImportArgs | string {
  const values: Record<string, string> = {};
  let source: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) {
      if (source !== undefined) return `Give one folder to import, not two. ${importUsage}`;
      source = arg;
      continue;
    }
    const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const value = inline ?? args[++i];
    if (value === undefined) return `--${key} needs a value. ${importUsage}`;
    values[key] = value;
  }
  const unknown = Object.keys(values).find((key) => !["name", "start", "lecturer", "out"].includes(key));
  if (unknown) return `Unknown option "--${unknown}". ${importUsage}`;
  if (source === undefined) return `Name the folder of material to import. ${importUsage}`;
  if (!values.name || slugify(values.name) === "") return `Give the course a name with --name. ${importUsage}`;
  if (values.start !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(values.start)) return `--start must be a date like 2027-01-25. ${importUsage}`;
  const spec: CourseSpec = { ...defaultSpec, courseName: values.name, lecturerName: values.lecturer ?? "", courseId: slugify(values.name) };
  return { source, spec, outputDir: values.out ?? ".", ...(values.start === undefined ? {} : { start: values.start }) };
}

const LINK_FILE = /\.(url|webloc|txt)$/i;
const LINK_FILE_LIMIT = 64 * 1024;

/** Every file under a folder, as course-rules' ImportFile: paths relative and "/"-separated, link files with their text. */
export function readImportFolder(root: string): ImportFile[] {
  const files: ImportFile[] = [];
  const visit = (relative: string) => {
    for (const entry of fs.readdirSync(path.join(root, relative), { withFileTypes: true })) {
      const child = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) visit(child);
      else if (entry.isFile()) {
        const full = path.join(root, child);
        const text = LINK_FILE.test(entry.name) && fs.statSync(full).size <= LINK_FILE_LIMIT ? fs.readFileSync(full, "utf-8") : undefined;
        files.push(text === undefined ? { path: child } : { path: child, text });
      }
    }
  };
  visit("");
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Writes a laid-out course into a folder that must not exist yet, so nothing of the lecturer's is ever overwritten. */
export function writeImport(layout: ImportLayout, source: string, courseDir: string): void {
  fs.mkdirSync(path.dirname(courseDir), { recursive: true });
  try {
    fs.mkdirSync(courseDir);
  } catch (error) {
    if ((error as { code?: string }).code === "EEXIST") throw new CourseDirectoryExistsError(courseDir);
    throw error;
  }
  for (const file of layout.files) {
    const target = path.join(courseDir, file.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content, { encoding: "utf-8", flag: "wx" });
  }
  for (const copy of layout.copies) {
    const target = path.join(courseDir, copy.to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(source, copy.from), target, fs.constants.COPYFILE_EXCL);
  }
}

/** What the lecturer reads after an import: where the course is, what went where, and what is left for them to place. */
export function importSummary(courseDir: string, proposal: ShapeProposal, errors: number): string {
  const placed = proposal.topics.reduce((sum, topic) => sum + topic.items.reduce((n, item) => n + item.files.length, 0), 0);
  const weeks = proposal.topics.map((topic) => topic.week);
  const lines = [`Created ${courseDir}: ${placed} file${placed === 1 ? "" : "s"} placed across week${weeks.length === 1 ? "" : "s"} ${weeks.join(", ")}.`];
  if (proposal.tray.length > 0) lines.push(`Place these by hand (their week or kind isn't clear from the name):`, ...proposal.tray.map((file) => `  ${file}`));
  lines.push(
    errors === 0
      ? "The course validates clean. Run tutors validate after you place the rest."
      : `tutors validate found ${errors} error${errors === 1 ? "" : "s"}; run it in ${courseDir} to see them.`
  );
  return lines.join("\n") + "\n";
}

/**
 * `tutors import <folder>`: proposes a course from a folder of existing material, writes it into a
 * new folder (the source is only read), and reports what it could not place. Exit 0 when the new course
 * has no errors, 1 otherwise or on bad arguments.
 */
export async function runImport(args: readonly string[], io: { out: (t: string) => void; err: (t: string) => void }): Promise<number> {
  const parsed = parseImportArgs(args);
  if (typeof parsed === "string") {
    io.err(parsed);
    return 1;
  }
  let proposal: ShapeProposal;
  try {
    proposal = proposeShape(readImportFolder(parsed.source));
  } catch (error) {
    io.err(`Couldn't read ${parsed.source}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  if (proposal.topics.length === 0) {
    io.err(`Nothing in ${parsed.source} names a week (like Week01.pdf or Lecture 3.pdf), so there is no course to propose.\n`);
    return 1;
  }
  const courseDir = path.join(parsed.outputDir, parsed.spec.courseId);
  try {
    writeImport(importLayout(parsed.spec, proposal, parsed.start === undefined ? {} : { start: parsed.start }), parsed.source, courseDir);
  } catch (error) {
    io.err(error instanceof CourseDirectoryExistsError ? `${error.message}\n` : `Could not create the course: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  const errors = (await validate(diskCourse(courseDir))).filter((finding) => finding.severity === "error").length;
  io.out(importSummary(courseDir, proposal, errors));
  return errors === 0 ? 0 : 1;
}
