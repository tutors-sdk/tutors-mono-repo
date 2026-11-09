import yaml from "js-yaml";
import { loTypes } from "@tutors/tutors-model-lib";
import type { FileOp } from "./finding.ts";
import { kindName, messages } from "./messages.ts";
import type { FileSystemPort } from "./ports.ts";
import { joinPath, readText } from "./ports.ts";
import type { CourseNode, CourseTree } from "./tree.ts";
import { buildCourseTree, extensionOf, kindOf } from "./tree.ts";
import { bodyOf, descriptorOf, mentionedIn, typedNodes } from "./warnings.ts";

/**
 * Rewiring a course: reorder, move, retitle, hide and remove, each planned as file operations that leave
 * names and files Tutors accepts. Like planFixes, a planner never writes: a shell shows the plan, and
 * applies it (applyFixes in the CLI, Studio's applyPlan) only once it is accepted. Nothing is ever
 * deleted; removing an item moves it into the bin.
 */

/**
 * Where removed items go: a folder in the course whose name starts with a dot, so the generator never
 * reads it and it is never published, while every file in it can still be put back.
 */
export const BIN_FOLDER = ".tutors-bin";

/** A plan to accept, with the sentences a lecturer should read first; or the reason there is none. */
export type RewirePlan = { ok: true; ops: FileOp[]; notes: string[] } | { ok: false; reason: string };

const refuse = (reason: string): RewirePlan => ({ ok: false, reason });

/** The folders each kind can sit in and still be shown by Tutors. Anything not named here holds no other item. */
const HOLDERS: Record<string, readonly string[]> = {
  unit: ["course"],
  side: ["course"],
  topic: ["course", "unit", "side"]
};
const ITEM_HOLDERS = ["course", "unit", "side", "topic"];
const holdersOf = (kind: string) => HOLDERS[kind] ?? ITEM_HOLDERS;

/** Longest first, so "paneltalk" wins over "talk", as the generator matches. */
const prefixes = [...loTypes].filter((type) => type !== "course").sort((a, b) => b.length - a.length);

/** The kind word a folder's name starts with, as written ("book" stays "book"). */
const prefixOf = (name: string) => prefixes.find((type) => name.startsWith(type)) ?? "";

/** The part of a folder's name after its kind and number, kept across a renumber: "talk-03-html-basics" gives "-html-basics". */
function restOf(name: string): string {
  const after = name.slice(prefixOf(name).length).replace(/^-?\d+/, "");
  return after === "" || after.startsWith("-") ? after : `-${after}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
const numberedName = (name: string, n: number) => `${prefixOf(name)}-${pad(n)}${restOf(name)}`;

/** The next name a folder takes among `taken`: its kind, the first free number, then the rest of its name. */
function nextFreeName(name: string, taken: readonly string[]): string {
  const prefix = prefixOf(name);
  let n = 1;
  while (taken.some((other) => prefixOf(other) === prefix && new RegExp(`^${prefix}-?0*${n}(?:-|$)`).test(other))) n++;
  return numberedName(name, n);
}

function find(tree: CourseTree, path: string): CourseNode | undefined {
  if (path === "") return tree;
  let node: CourseNode | undefined = tree;
  for (const part of path.split("/")) node = node?.children.find((child) => child.name === part);
  return node;
}

const parentOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

async function pagesOf(fs: FileSystemPort, tree: CourseTree): Promise<string[]> {
  const pages: string[] = [];
  for (const node of typedNodes(tree)) for (const file of node.files) if (extensionOf(file.name) === "md") pages.push(await readText(fs, file.path));
  return pages;
}

/** A sentence for each renamed folder a page names, since that link would break. */
async function linkNotes(fs: FileSystemPort, tree: CourseTree, renamed: readonly string[]): Promise<string[]> {
  const pages = await pagesOf(fs, tree);
  return renamed.filter((name) => mentionedIn(pages, name)).map((name) => messages.rewireLinked(name));
}

/** The ids properties.yaml's ignore list hides, and the file's text; empty when there is no file or no list. */
async function ignoreList(fs: FileSystemPort): Promise<{ text: string; ids: string[] }> {
  if (!(await fs.exists("properties.yaml"))) return { text: "", ids: [] };
  const text = await readText(fs, "properties.yaml");
  let parsed: unknown;
  try {
    parsed = yaml.load(text);
  } catch {
    return { text, ids: [] };
  }
  const ignore = parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>).ignore : undefined;
  return { text, ids: Array.isArray(ignore) ? ignore.map(String) : [] };
}

/** properties.yaml with its ignore list replaced by `ids`, every other line kept as written. */
function withIgnore(text: string, ids: readonly string[]): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^ignore\s*:/.test(lines[i])) {
      // Skip the key and the indented or dashed lines of its block list.
      while (i + 1 < lines.length && /^(\s+\S|-\s)/.test(lines[i + 1])) i++;
      continue;
    }
    kept.push(lines[i]);
  }
  while (kept.length > 0 && kept[kept.length - 1] === "") kept.pop();
  const block = ids.length === 0 ? [] : ["ignore:", ...ids.map((id) => `  - ${id}`)];
  const all = [...kept, ...block];
  return all.length === 0 ? "" : `${all.join("\n")}\n`;
}

/** The write that keeps properties.yaml's ignore list pointing at top-level folders after they are renamed. */
async function ignoreFollows(fs: FileSystemPort, renames: ReadonlyMap<string, string>): Promise<FileOp[]> {
  const { text, ids } = await ignoreList(fs);
  if (!ids.some((id) => renames.has(id))) return [];
  return [
    {
      op: "write",
      path: "properties.yaml",
      content: withIgnore(
        text,
        ids.map((id) => renames.get(id) ?? id)
      ),
      replace: true
    }
  ];
}

/** Renames among siblings, through temporary names, so swapping two names never meets a folder already there. */
function renameAll(parent: string, renames: ReadonlyMap<string, string>): FileOp[] {
  const changed = [...renames].filter(([from, to]) => from !== to);
  return [
    ...changed.map(([from, to]): FileOp => ({ op: "move", from: joinPath(parent, from), to: joinPath(parent, `${to}.tutors-rewire`) })),
    ...changed.map(([, to]): FileOp => ({ op: "move", from: joinPath(parent, `${to}.tutors-rewire`), to: joinPath(parent, to) }))
  ];
}

/**
 * Puts the items of one kind in a folder in a new order by renumbering their folders (talk-01, talk-02,
 * ...), keeping each name after its number. Tutors orders a folder's items by kind first and by folder
 * name within a kind, so only items of one kind can be ordered against each other.
 */
export async function planReorder(fs: FileSystemPort, parent: string, order: readonly string[]): Promise<RewirePlan> {
  const tree = await buildCourseTree(fs);
  const folder = find(tree, parent);
  if (folder === undefined) return refuse(messages.rewireMissing(parent));
  const named = order.map((name) => folder.children.find((child) => child.name === name));
  const missing = order.find((_, i) => named[i] === undefined || named[i]!.kind === null);
  if (missing !== undefined) return refuse(messages.rewireMissing(joinPath(parent, missing)));
  const kinds = new Set(named.map((node) => node!.kind));
  if (kinds.size !== 1) return refuse(messages.rewireMixedKinds());
  const kind = [...kinds][0]!;
  const siblings = folder.children.filter((child) => child.kind === kind).map((child) => child.name);
  if (siblings.length !== order.length || new Set(order).size !== order.length) return refuse(messages.rewireWholeKind(kind));
  const renames = new Map(order.map((name, i) => [name, numberedName(name, i + 1)] as const));
  const ops = [...renameAll(parent, renames), ...(parent === "" ? await ignoreFollows(fs, renames) : [])];
  const renamed = [...renames].filter(([from, to]) => from !== to).map(([from]) => from);
  return { ok: true, ops, notes: await linkNotes(fs, tree, renamed) };
}

/**
 * Moves an item into another folder of the course, where it takes the next free number of its kind.
 * Refuses a folder Tutors would not show it in: a unit or side unit only at the top, a topic at the top
 * or in a unit, any other item at the top, in a unit or in a topic.
 */
export async function planMove(fs: FileSystemPort, item: string, into: string): Promise<RewirePlan> {
  const tree = await buildCourseTree(fs);
  const node = find(tree, item);
  if (node === undefined || item === "" || node.kind === null) return refuse(messages.rewireMissing(item));
  const target = find(tree, into);
  if (target === undefined || target.kind === null) return refuse(messages.rewireMissing(into));
  if (into === item || into.startsWith(`${item}/`)) return refuse(messages.rewireIntoItself());
  if (!holdersOf(node.kind).includes(target.kind)) return refuse(messages.rewireCantHold(node.kind, target.kind, holdersOf(node.kind)));
  if (parentOf(item) === into) return { ok: true, ops: [], notes: [] };
  const name = nextFreeName(
    node.name,
    target.children.map((child) => child.name)
  );
  const ops: FileOp[] = [{ op: "move", from: item, to: joinPath(into, name) }];
  if (parentOf(item) === "") ops.push(...(await ignoreFollows(fs, new Map([[node.name, name]]))));
  return { ok: true, ops, notes: await linkNotes(fs, tree, [node.name]) };
}

/** Gives an item a new title by rewriting only the title line of the page Tutors takes its title from. */
export async function planRetitle(fs: FileSystemPort, item: string, title: string): Promise<RewirePlan> {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean === "") return refuse(messages.rewireNoTitle());
  const tree = await buildCourseTree(fs);
  const node = find(tree, item);
  if (node === undefined || node.kind === null) return refuse(messages.rewireMissing(item));
  const page = descriptorOf(node);
  if (page === undefined) return refuse(messages.rewireNoPage(kindName(node.kind)));
  const text = await readText(fs, page);
  const body = bodyOf(text);
  const head = text.slice(0, text.length - body.length);
  const newline = body.indexOf("\n");
  const rest = newline === -1 ? "\n" : body.slice(newline);
  return { ok: true, ops: [{ op: "write", path: page, content: `${head}# ${clean}${rest}`, replace: true }], notes: [] };
}

/**
 * Hides a topic or unit at the top of the course from students, or shows it again, through the ignore list
 * in properties.yaml. Tutors has no way to hide an item inside a topic, so that is refused with a reason.
 */
export async function planHide(fs: FileSystemPort, item: string, hidden: boolean): Promise<RewirePlan> {
  const tree = await buildCourseTree(fs);
  const node = find(tree, item);
  if (node === undefined || item === "" || node.kind === null) return refuse(messages.rewireMissing(item));
  if (item.includes("/")) return refuse(messages.rewireHideTopOnly(kindName(node.kind)));
  const { text, ids } = await ignoreList(fs);
  if (ids.includes(item) === hidden) return { ok: true, ops: [], notes: [] };
  const next = hidden ? [...ids, item] : ids.filter((id) => id !== item);
  return { ok: true, ops: [{ op: "write", path: "properties.yaml", content: withIgnore(text, next), replace: true }], notes: [] };
}

/** Removes an item from the course by moving it into the bin, under its own name or a numbered one when the bin has that name already. */
export async function planBin(fs: FileSystemPort, item: string): Promise<RewirePlan> {
  const tree = await buildCourseTree(fs);
  const node = find(tree, item);
  // A single file (a PDF in a talk, say) goes to the bin as well as a whole folder.
  if (item === "" || item === BIN_FOLDER || item.startsWith(`${BIN_FOLDER}/`) || (node === undefined && !(await fs.exists(item)))) return refuse(messages.rewireMissing(item));
  const own = item.slice(item.lastIndexOf("/") + 1);
  const taken = (await fs.exists(BIN_FOLDER)) ? (await fs.list(BIN_FOLDER)).map((entry) => entry.name) : [];
  const dot = node === undefined ? own.lastIndexOf(".") : -1;
  const [stem, extension] = dot > 0 ? [own.slice(0, dot), own.slice(dot)] : [own, ""];
  let name = own;
  for (let n = 2; taken.includes(name); n++) name = `${stem}-${n}${extension}`;
  const ops: FileOp[] = [{ op: "move", from: item, to: joinPath(BIN_FOLDER, name) }];
  if (!item.includes("/")) {
    const { text, ids } = await ignoreList(fs);
    if (ids.includes(item))
      ops.push({
        op: "write",
        path: "properties.yaml",
        content: withIgnore(
          text,
          ids.filter((id) => id !== item)
        ),
        replace: true
      });
  }
  return { ok: true, ops, notes: await linkNotes(fs, tree, [own]) };
}

/** Puts an item back from the bin into a folder of the course, with the next free number of its kind there. */
export async function planRestore(fs: FileSystemPort, binned: string, into: string): Promise<RewirePlan> {
  const name = binned.startsWith(`${BIN_FOLDER}/`) ? binned.slice(BIN_FOLDER.length + 1) : binned;
  const path = joinPath(BIN_FOLDER, name);
  if (name === "" || name.includes("/") || !(await fs.exists(path))) return refuse(messages.rewireNotInBin(name));
  const kind = kindOf(name);
  const tree = await buildCourseTree(fs);
  const target = find(tree, into);
  if (target === undefined || target.kind === null) return refuse(messages.rewireMissing(into));
  if (kind !== null && !holdersOf(kind).includes(target.kind)) return refuse(messages.rewireCantHold(kind, target.kind, holdersOf(kind)));
  const taken = target.children.map((child) => child.name);
  const to = kind === null ? name : nextFreeName(name, taken);
  if (taken.includes(to) || target.files.some((file) => file.name === to)) return refuse(messages.rewireTaken(joinPath(into, to)));
  return { ok: true, ops: [{ op: "move", from: path, to: joinPath(into, to) }], notes: [] };
}
