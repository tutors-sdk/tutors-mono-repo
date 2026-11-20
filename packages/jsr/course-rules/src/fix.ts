import type { FileOp, Finding } from "./finding.ts";
import type { FileSystemPort } from "./ports.ts";
import { joinPath } from "./ports.ts";
import { validate } from "./validate.ts";

const depth = (path: string) => path.split("/").length;
const opPath = (op: FileOp) => (op.op === "move" ? op.from : op.path);

/**
 * The safe fixes among the findings, as one plan: renames and the standard netlify.toml, never an edit to
 * a lecturer's own text. Deepest paths first, so renaming a file inside a folder happens before the
 * folder itself is renamed and every path in the plan is still valid when its turn comes.
 */
export function planFixes(findings: readonly Finding[]): FileOp[] {
  const seen = new Set<string>();
  const ops: FileOp[] = [];
  for (const finding of findings) {
    if (finding.fix === undefined) continue;
    const key = JSON.stringify(finding.fix);
    if (seen.has(key)) continue;
    seen.add(key);
    ops.push(finding.fix);
  }
  return ops.sort((a, b) => depth(opPath(b)) - depth(opPath(a)) || (opPath(a) < opPath(b) ? -1 : opPath(a) > opPath(b) ? 1 : 0));
}

export interface FixOutcome {
  applied: FileOp[];
  /** Operations not applied, each with the reason (the target already exists, or the file system refused). */
  skipped: { op: FileOp; reason: string }[];
}

/**
 * Applies a plan through the port. An operation whose target already exists is skipped, never
 * overwritten, unless it is a write marked `replace` (a rewiring planner rewriting a title or the ignore list). A rename that changes only letter case goes through a temporary name, so it also works on
 * the case-insensitive disks of macOS and Windows.
 */
export async function applyFixes(fs: FileSystemPort, root: string, ops: readonly FileOp[]): Promise<FixOutcome> {
  const outcome: FixOutcome = { applied: [], skipped: [] };
  for (const op of ops) {
    try {
      if (op.op === "write") {
        if (op.replace !== true && (await fs.exists(joinPath(root, op.path)))) {
          outcome.skipped.push({ op, reason: `${op.path} already exists` });
          continue;
        }
        await fs.write(joinPath(root, op.path), new TextEncoder().encode(op.content));
      } else {
        const from = joinPath(root, op.from);
        const to = joinPath(root, op.to);
        if (op.from.toLowerCase() === op.to.toLowerCase()) {
          // exists() can't tell "talk-intro" from "talk-Intro" on a case-insensitive disk, so look for the exact name.
          if (await existsExactly(fs, to)) {
            outcome.skipped.push({ op, reason: `${op.to} already exists` });
            continue;
          }
          const temporary = `${from}.tutors-rename`;
          await fs.move(from, temporary);
          await fs.move(temporary, to);
        } else {
          if (await fs.exists(to)) {
            outcome.skipped.push({ op, reason: `${op.to} already exists` });
            continue;
          }
          await fs.move(from, to);
        }
      }
      outcome.applied.push(op);
    } catch (error: unknown) {
      outcome.skipped.push({ op, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcome;
}

async function existsExactly(fs: FileSystemPort, path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  return (await fs.list(slash === -1 ? "" : path.slice(0, slash))).some((entry) => entry.name === name);
}

/** `tutors validate --fix`: validate, apply the safe fixes, and validate again so the report shows what is left. */
export async function fixCourse(fs: FileSystemPort, root = ""): Promise<FixOutcome & { findings: Finding[] }> {
  const outcome = await applyFixes(fs, root, planFixes(await validate(fs, root)));
  return { ...outcome, findings: await validate(fs, root) };
}
