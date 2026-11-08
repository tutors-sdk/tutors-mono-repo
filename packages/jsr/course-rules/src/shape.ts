import { extensionOf } from "./tree.ts";

/**
 * Shape from content: given a folder of a lecturer's existing material (a semester of PDFs, a Moodle
 * export, a Dropbox folder), propose the course it becomes, one topic per week. Pure: it sees paths and,
 * for link files, their text; it never reads or writes a disk. A file it cannot place with confidence
 * goes to the tray for the lecturer to place: it never guesses.
 */

export interface ImportFile {
  /** Relative to the folder being imported, "/"-separated. */
  path: string;
  /** The contents, for small text files that may hold a link (.url, .webloc, .txt). Leave out otherwise. */
  text?: string;
}

export type ShapeKind = "talk" | "note" | "lab" | "archive" | "web";

export interface ShapeItem {
  kind: ShapeKind;
  title: string;
  /** The files that become this item, as given. A lab's are its steps (and anything beside them), in step order. */
  files: string[];
  /** For a web link: the address. */
  url?: string;
}

export interface ShapeTopic {
  week: number;
  items: ShapeItem[];
}

export interface ShapeProposal {
  topics: ShapeTopic[];
  /** Files with no clear week or kind, for the lecturer to place by hand. */
  tray: string[];
}

const MAX_WEEK = 52;
const kindOrder: ShapeKind[] = ["talk", "note", "lab", "archive", "web"];

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const folderOf = (path: string) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
const stemOf = (name: string) => (name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name);

/** Files nobody means to import: hidden files, Office lock files, OS litter. */
function isLitter(path: string): boolean {
  return path.split("/").some((part) => part.startsWith(".") || part.startsWith("~$") || part === "__MACOSX") || /^(thumbs\.db|desktop\.ini)$/i.test(baseName(path));
}

const WEEK_WORD = /(?:^|[^a-z])(?:week|wk|w|lecture|lect|lec|l|topic|session|class)[\s._-]*0*(\d{1,2})(?!\d)/i;
const LEADING_NUMBER = /^0*(\d{1,2})(?=[\s._-]|$)/;
const DATE = /(\d{4})-(\d{2})-(\d{2})/;

/** The week a name declares: "Week01", "Lecture 3", "L4", "Topic-5", "w6", or a leading "07 ". Null when it declares none. */
export function weekOf(name: string): number | null {
  const stem = stemOf(name);
  const match = WEEK_WORD.exec(stem) ?? LEADING_NUMBER.exec(stem);
  if (match === null) return null;
  const week = Number(match[1]);
  return week >= 1 && week <= MAX_WEEK ? week : null;
}

/** The week of a path: from the file's own name, else from the nearest folder that names one. */
function weekOfPath(path: string): number | null {
  const parts = path.split("/");
  for (let i = parts.length - 1; i >= 0; i--) {
    const week = weekOf(parts[i]);
    if (week !== null) return week;
  }
  return null;
}

const dateOfPath = (path: string) => DATE.exec(path)?.[0] ?? null;

/** The address a link file holds: a .url's URL= line, a .webloc's <string>, or a .txt whose first line is one. */
export function linkOf(file: ImportFile): string | null {
  if (file.text === undefined) return null;
  const extension = extensionOf(file.path);
  let candidate: string | undefined;
  if (extension === "url") candidate = /^URL=(.+)$/m.exec(file.text)?.[1];
  else if (extension === "webloc") candidate = /<string>([^<]+)<\/string>/.exec(file.text)?.[1];
  else if (extension === "txt") candidate = file.text.split(/\r?\n/)[0];
  candidate = candidate?.trim();
  return candidate !== undefined && /^https?:\/\/\S+$/.test(candidate) ? candidate : null;
}

const titleOf = (name: string) => stemOf(name).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();

const LAB_STEP = /^(\d{1,2})[\s._-]/;

/** Folders whose .md files are all numbered steps, at least two of them: each becomes one lab. */
function labFolders(files: ImportFile[]): Map<string, string[]> {
  const byFolder = new Map<string, string[]>();
  for (const file of files) {
    if (extensionOf(file.path) !== "md") continue;
    const folder = folderOf(file.path);
    byFolder.set(folder, [...(byFolder.get(folder) ?? []), file.path]);
  }
  const labs = new Map<string, string[]>();
  for (const [folder, md] of byFolder) {
    if (folder !== "" && md.length >= 2 && md.every((path) => LAB_STEP.test(baseName(path)))) {
      labs.set(
        folder,
        md.sort((a, b) => Number(LAB_STEP.exec(baseName(a))![1]) - Number(LAB_STEP.exec(baseName(b))![1]) || (a < b ? -1 : 1))
      );
    }
  }
  return labs;
}

interface Candidate {
  item: ShapeItem;
  /** Where the item's week is read from. */
  path: string;
}

/** What one loose file becomes, by its extension (and, for a link file, its contents); null when unrecognised. */
function itemFor(file: ImportFile): ShapeItem | null {
  const name = baseName(file.path);
  switch (extensionOf(name)) {
    case "pdf":
      return { kind: "talk", title: titleOf(name), files: [file.path] };
    case "md":
    case "docx":
    case "odt":
      return { kind: "note", title: titleOf(name), files: [file.path] };
    case "zip":
      return { kind: "archive", title: titleOf(name), files: [file.path] };
    case "url":
    case "webloc":
    case "txt": {
      const url = linkOf(file);
      return url === null ? null : { kind: "web", title: titleOf(name), files: [file.path], url };
    }
    default:
      return null;
  }
}

/**
 * Proposes a course shape from a folder of material:
 *  - a file whose name (or folder) gives a week becomes an item in that week's topic: a .pdf a Talk, a
 *    .md/.docx a Note, a .zip an Archive, a link file a Web link;
 *  - a folder of numbered .md files becomes one Lab with those steps;
 *  - when no file names a week but some carry dates (2027-01-25), weeks follow the dates in order;
 *  - everything else goes to the tray.
 */
export function proposeShape(files: readonly ImportFile[]): ShapeProposal {
  const wanted = files.filter((file) => !isLitter(file.path));
  const labs = labFolders(wanted);
  const inLab = (path: string) => [...labs.keys()].some((folder) => path === folder || path.startsWith(`${folder}/`));

  const candidates: Candidate[] = [];
  const tray: string[] = [];
  for (const [folder, steps] of labs) {
    const extras = wanted
      .filter((file) => file.path.startsWith(`${folder}/`) && !steps.includes(file.path))
      .map((file) => file.path)
      .sort();
    candidates.push({ item: { kind: "lab", title: titleOf(baseName(folder)), files: [...steps, ...extras] }, path: folder });
  }
  for (const file of wanted) {
    if (inLab(file.path)) continue;
    const item = itemFor(file);
    if (item === null) tray.push(file.path);
    else candidates.push({ item, path: file.path });
  }

  const numbered = candidates.some((candidate) => weekOfPath(candidate.path) !== null);
  const dates = numbered ? [] : [...new Set(candidates.map((candidate) => dateOfPath(candidate.path)).filter((date) => date !== null))].sort();
  const weekFor = (path: string): number | null => {
    if (numbered) return weekOfPath(path);
    const date = dateOfPath(path);
    return date === null ? null : dates.indexOf(date) + 1;
  };

  const weeks = new Map<number, ShapeItem[]>();
  for (const { item, path } of candidates) {
    const week = weekFor(path);
    if (week === null || week > MAX_WEEK) tray.push(...item.files);
    else weeks.set(week, [...(weeks.get(week) ?? []), item]);
  }

  const topics = [...weeks.entries()]
    .sort(([a], [b]) => a - b)
    .map(([week, items]) => ({
      week,
      items: items.sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind) || (a.files[0] < b.files[0] ? -1 : a.files[0] > b.files[0] ? 1 : 0))
    }));
  return { topics, tray: tray.sort() };
}
