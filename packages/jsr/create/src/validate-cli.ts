import {
  applyFixes,
  exitCodeFor,
  planFixes,
  report,
  rulesVersion,
  validate,
  type ExitCode,
  type FileOp,
  type FileSystemPort,
  type Finding,
  type FixOutcome,
  type ReportFormat
} from "@tutors/course-rules";
import { diskCourse } from "./course-fs.ts";

export interface ValidateOptions {
  dir: string;
  format: ReportFormat;
  strict: boolean;
  fix: boolean;
}

export const validateUsage = "Usage: tutors validate [folder] [--format text|json|sarif] [--strict] [--fix]\n";

/** Reads `validate [dir] [--format f] [--strict] [--fix]`; returns a message instead when the arguments are wrong. */
export function parseValidateArgs(args: readonly string[]): ValidateOptions | string {
  const options: ValidateOptions = { dir: ".", format: "text", strict: false, fix: false };
  let dirSeen = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--strict") options.strict = true;
    else if (arg === "--fix") options.fix = true;
    else if (arg === "--format" || arg.startsWith("--format=")) {
      const value = arg === "--format" ? args[++i] : arg.slice("--format=".length);
      if (value !== "text" && value !== "json" && value !== "sarif") return `Unknown format "${value ?? ""}". ${validateUsage}`;
      options.format = value;
    } else if (arg.startsWith("-")) return `Unknown option "${arg}". ${validateUsage}`;
    else if (dirSeen) return `Give one folder, not two. ${validateUsage}`;
    else {
      options.dir = arg;
      dirSeen = true;
    }
  }
  return options;
}

export interface ValidateIo {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Opens the folder; tests swap in an in-memory course. */
  open?: (dir: string) => FileSystemPort;
  /** The rules; tests swap in a fake to reach a finding the real rules can't produce. */
  check?: (fs: FileSystemPort) => Promise<Finding[]>;
}

const describeOp = (op: FileOp) => (op.op === "move" ? `rename ${op.from} to ${op.to}` : `write ${op.path}`);

/** One line per fix applied or skipped, so the lecturer sees exactly what --fix changed. */
export function fixSummary(outcome: FixOutcome): string {
  const lines = [...outcome.applied.map((op) => `fixed   ${describeOp(op)}`), ...outcome.skipped.map(({ op, reason }) => `skipped ${describeOp(op)}: ${reason}`)];
  return lines.length === 0 ? "Nothing to fix automatically.\n" : lines.join("\n") + "\n";
}

/**
 * `tutors validate`: checks a course folder and prints every finding. With --fix it first applies the
 * safe fixes (renames and the standard netlify.toml, never an overwrite) and then reports what is left.
 * Exit codes: 0 clean, 1 errors, 2 warnings under --strict, 3 the folder could not be read (or the
 * arguments were wrong).
 */
export async function runValidate(args: readonly string[], io: ValidateIo): Promise<ExitCode> {
  const options = parseValidateArgs(args);
  if (typeof options === "string") {
    io.err(options);
    return 3;
  }
  let findings: Finding[];
  try {
    const course = (io.open ?? diskCourse)(options.dir);
    const check = io.check ?? validate;
    findings = await check(course);
    if (options.fix) {
      const outcome = await applyFixes(course, "", planFixes(findings));
      // The fix log goes to stderr when stdout is JSON or SARIF, so the machine-readable report stays parseable.
      (options.format === "text" ? io.out : io.err)(fixSummary(outcome));
      findings = await check(course);
    }
  } catch (error) {
    io.err(`Couldn't read the course folder ${options.dir}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 3;
  }
  io.out(report(findings, options.format, rulesVersion, options.dir));
  return exitCodeFor(findings, options.strict);
}
