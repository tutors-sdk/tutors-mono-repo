import { exitCodeFor, report, rulesVersion, validate, type ExitCode, type FileSystemPort, type Finding, type ReportFormat } from "@tutors/course-rules";
import { diskCourse } from "./course-fs.ts";

export interface ValidateOptions {
  dir: string;
  format: ReportFormat;
  strict: boolean;
}

export const validateUsage = "Usage: tutors validate [folder] [--format text|json|sarif] [--strict]\n";

/** Reads `validate [dir] [--format f] [--strict]`; returns a message instead when the arguments are wrong. */
export function parseValidateArgs(args: readonly string[]): ValidateOptions | string {
  const options: ValidateOptions = { dir: ".", format: "text", strict: false };
  let dirSeen = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--strict") options.strict = true;
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
  /** The rules; tests swap in a fake to reach a warning before warning rules exist. */
  check?: (fs: FileSystemPort) => Promise<Finding[]>;
}

/**
 * `tutors validate`: checks a course folder and prints every finding. Exit codes: 0 clean, 1 errors,
 * 2 warnings under --strict, 3 the folder could not be read (or the arguments were wrong).
 */
export async function runValidate(args: readonly string[], io: ValidateIo): Promise<ExitCode> {
  const options = parseValidateArgs(args);
  if (typeof options === "string") {
    io.err(options);
    return 3;
  }
  let findings: Finding[];
  try {
    findings = await (io.check ?? validate)((io.open ?? diskCourse)(options.dir));
  } catch (error) {
    io.err(`Couldn't read the course folder ${options.dir}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 3;
  }
  io.out(report(findings, options.format, rulesVersion, options.dir));
  return exitCodeFor(findings, options.strict);
}
