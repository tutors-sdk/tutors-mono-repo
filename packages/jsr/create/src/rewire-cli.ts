import {
  applyFixes,
  planBin,
  planHide,
  planMove,
  planReorder,
  planRestore,
  planRetitle,
  type ExitCode,
  type FileOp,
  type FileSystemPort,
  type RewirePlan
} from "@tutors/course-rules";
import { diskCourse } from "./course-fs.ts";

export const rewireUsage = `Usage: tutors rewire <action> [--course folder] [--plan]
  reorder <folder> <item> <item> ...   put the items of one kind in a folder in this order ("" is the course)
  move <item> <folder>                 move an item into another folder
  retitle <item> <title>               give an item a new title
  hide <topic> | show <topic>          hide a topic or unit at the top of the course from students, or show it again
  remove <item>                        move an item to the course's bin, which Tutors never reads
  restore <name> <folder>              put an item back from the bin
`;

export interface RewireIo {
  out: (text: string) => void;
  err: (text: string) => void;
  /** Opens the folder; tests swap in an in-memory course. */
  open?: (dir: string) => FileSystemPort;
}

type Planner = (fs: FileSystemPort, args: string[]) => Promise<RewirePlan>;

const planners: Record<string, { arity: number | "many"; plan: Planner }> = {
  reorder: { arity: "many", plan: (fs, [folder, ...order]) => planReorder(fs, folder, order) },
  move: { arity: 2, plan: (fs, [item, into]) => planMove(fs, item, into) },
  retitle: { arity: 2, plan: (fs, [item, title]) => planRetitle(fs, item, title) },
  hide: { arity: 1, plan: (fs, [item]) => planHide(fs, item, true) },
  show: { arity: 1, plan: (fs, [item]) => planHide(fs, item, false) },
  remove: { arity: 1, plan: (fs, [item]) => planBin(fs, item) },
  restore: { arity: 2, plan: (fs, [name, into]) => planRestore(fs, name, into) }
};

/**
 * `tutors rewire`: reorders, moves, retitles, hides and removes items so the course keeps names and files
 * Tutors accepts, using the same planners as Tutors Studio. With --plan it prints the plan as JSON and
 * changes nothing; otherwise it applies the plan and says what changed. Exit codes: 0 done, 1 the change
 * was refused (the reason is printed), 3 the arguments were wrong or the folder could not be read.
 */
export async function runRewire(args: readonly string[], io: RewireIo): Promise<ExitCode> {
  let dir = ".";
  let planOnly = false;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--plan") planOnly = true;
    else if (args[i] === "--course") dir = args[++i] ?? "";
    else if (args[i].startsWith("--course=")) dir = args[i].slice("--course=".length);
    else rest.push(args[i]);
  }
  const [action, ...operands] = rest;
  const planner = planners[action ?? ""];
  if (planner === undefined || dir === "" || (planner.arity === "many" ? operands.length < 2 : operands.length !== planner.arity)) {
    io.err(rewireUsage);
    return 3;
  }
  let course: FileSystemPort;
  let plan: RewirePlan;
  try {
    course = (io.open ?? diskCourse)(dir);
    plan = await planner.plan(course, operands);
  } catch (error) {
    io.err(`Couldn't read the course folder ${dir}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 3;
  }
  if (!plan.ok) {
    io.err(`${plan.reason}\n`);
    return 1;
  }
  if (planOnly) {
    io.out(`${JSON.stringify({ ops: plan.ops, notes: plan.notes }, null, 2)}\n`);
    return 0;
  }
  const outcome = await applyFixes(course, "", plan.ops);
  const lines = [
    ...collapse(outcome.applied).map((op) => (op.op === "move" ? `moved   ${op.from} to ${op.to}` : `wrote   ${op.path}`)),
    ...outcome.skipped.map(({ op, reason }) => `skipped ${op.op === "move" ? `${op.from} to ${op.to}` : op.path}: ${reason}`),
    ...plan.notes
  ];
  io.out(lines.length === 0 ? "Nothing to change.\n" : `${lines.join("\n")}\n`);
  return outcome.skipped.length === 0 ? 0 : 1;
}

/** A swap goes through a temporary name; report each one as the single move the lecturer asked for. */
function collapse(ops: readonly FileOp[]): FileOp[] {
  const through = new Map<string, string>();
  const shown: FileOp[] = [];
  for (const op of ops) {
    if (op.op === "move" && op.to.endsWith(".tutors-rewire")) through.set(op.to, op.from);
    else if (op.op === "move" && through.has(op.from)) shown.push({ op: "move", from: through.get(op.from)!, to: op.to });
    else shown.push(op);
  }
  return shown;
}
