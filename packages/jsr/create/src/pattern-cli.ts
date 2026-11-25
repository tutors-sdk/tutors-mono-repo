import { patternById, patterns } from "./patterns.ts";
import { CourseDirectoryExistsError, nextStepsMessage, writeCourseToFilesystem } from "./scaffolder.ts";
import { defaultSpec, slugify, type CourseSpec } from "./types.ts";

export const patternUsage = "Usage: tutors-create --pattern <id> --name <course name> --start YYYY-MM-DD [--weeks 12] [--reading-week N] [--lecturer <name>] [--out <folder>]\n";

export const patternList = () => `The patterns are:\n${patterns.map((p) => `  ${p.id.padEnd(14)} ${p.name}: ${p.description}`).join("\n")}\n`;

export interface PatternArgs {
  spec: CourseSpec;
  outputDir: string;
}

/** Reads the non-interactive, pattern-driven create command. Returns a message when the arguments are wrong. */
export function parsePatternArgs(args: readonly string[]): PatternArgs | string {
  const values: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith("--")) return `Unexpected "${arg}". ${patternUsage}`;
    const [key, inline] = arg.slice(2).split(/=(.*)/s, 2);
    const value = inline ?? args[++i];
    if (value === undefined) return `--${key} needs a value. ${patternUsage}`;
    values[key] = value;
  }
  const known = ["pattern", "name", "start", "weeks", "reading-week", "lecturer", "out"];
  const unknown = Object.keys(values).find((key) => !known.includes(key));
  if (unknown) return `Unknown option "--${unknown}". ${patternUsage}`;
  if (!values.pattern || !patternById(values.pattern)) return `Unknown pattern "${values.pattern ?? ""}". ${patternList()}`;
  if (!values.name || slugify(values.name) === "") return `Give the course a name with --name. ${patternUsage}`;
  if (!values.start || !/^\d{4}-\d{2}-\d{2}$/.test(values.start)) return `Give the first Monday of teaching with --start, like 2027-01-25. ${patternUsage}`;
  const weeks = values.weeks === undefined ? 12 : Number(values.weeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 52) return `--weeks must be a whole number from 1 to 52.\n`;
  const readingWeek = values["reading-week"] === undefined ? undefined : Number(values["reading-week"]);
  if (readingWeek !== undefined && (!Number.isInteger(readingWeek) || readingWeek < 1 || readingWeek >= weeks)) return `--reading-week must be a teaching week before the last.\n`;
  const spec: CourseSpec = {
    ...defaultSpec,
    courseName: values.name,
    lecturerName: values.lecturer ?? "",
    courseId: slugify(values.name),
    pattern: { id: values.pattern, weeks, start: values.start, ...(readingWeek === undefined ? {} : { readingWeek }) }
  };
  return { spec, outputDir: values.out ?? "." };
}

/** `tutors-create --pattern ...`: creates a whole course from three answers. Returns the exit code. */
export function runPatternCreate(args: readonly string[], io: { out: (t: string) => void; err: (t: string) => void }): number {
  const parsed = parsePatternArgs(args);
  if (typeof parsed === "string") {
    io.err(parsed);
    return 1;
  }
  try {
    writeCourseToFilesystem(parsed.spec, parsed.outputDir);
  } catch (error) {
    io.err(error instanceof CourseDirectoryExistsError ? `${error.message}\n` : `Could not create the course: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
  io.out(nextStepsMessage(parsed.spec));
  return 0;
}
