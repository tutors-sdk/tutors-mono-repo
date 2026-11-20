/**
 * The commands of the one `tutors` program (Rule 0777, issue #603): each names the package that does the work,
 * so the program is a thin front door and `deno run jsr:...` stays the same code.
 */
export type Command =
  | { kind: "build" }
  | { kind: "website" }
  | { kind: "validate"; args: string[] }
  | { kind: "import"; args: string[] }
  | { kind: "rewire"; args: string[] }
  | { kind: "create"; args: string[] }
  | { kind: "version" }
  | { kind: "help"; unknown?: string };

export const usage = `Usage: tutors <command>

  build       build the course in this folder into json/ for the Tutors reader (@tutors/tutors)
  website     build the course in this folder into html/, a website of its own (@tutors/tutors-lite)
  validate    check a course folder: tutors validate [folder] [--format text|json|sarif] [--strict] [--fix]
  import      propose a course from a folder of material: tutors import <folder> --name <course name>
  rewire      reorder, move, retitle, hide, show, remove or restore an item: tutors rewire <action> ... [--plan]
  create      make a new course, from a pattern (--pattern) or by answering questions
  --version   print the versions inside this program
`;

export function commandFor(args: readonly string[]): Command {
  const [first, ...rest] = args;
  switch (first) {
    case "build":
      return { kind: "build" };
    case "website":
      return { kind: "website" };
    case "validate":
      return { kind: "validate", args: rest };
    case "import":
      return { kind: "import", args: rest };
    case "rewire":
      return { kind: "rewire", args: rest };
    case "create":
      return { kind: "create", args: rest };
    case "--version":
    case "-V":
    case "version":
      return { kind: "version" };
    case undefined:
    case "help":
    case "--help":
    case "-h":
      return { kind: "help" };
    default:
      return { kind: "help", unknown: first };
  }
}
