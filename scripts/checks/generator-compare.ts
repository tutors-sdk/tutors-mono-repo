import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { globToRegExp } from "./suite-health.ts";
import { toPosix, walk } from "./lib/repo.ts";

/**
 * Generator differential (runway tier C): pure pieces. A generator run is
 * reduced to a snapshot (normalised file contents), two snapshots are diffed
 * into hunks, and every hunk must be claimed by an intended change.
 */

/* ---------------- masks ---------------- */

/**
 * Everything the normaliser hides. A mask is a blind spot somebody chose, so
 * each one carries its reason; adding one is a reviewed change to this list.
 */
export const MASKS: readonly { id: string; reason: string }[] = [
  {
    id: "zip-container",
    reason:
      "archiver stamps each zip entry with the current time and compression output can vary, so zips compare by entry name, CRC-32 and size only"
  },
  {
    id: "json-key-order",
    reason: "tutors.json consumers read keys by name; object key order is compared sorted"
  },
  {
    id: "line-endings",
    reason:
      "a Windows checkout with core.autocrlf gives templates CRLF line endings while git archive and Linux give LF; text compares with LF line endings"
  },
  {
    id: "course-root",
    reason:
      "the absolute path of the course folder differs between checkouts and CI runners; it is replaced with <COURSE> in text and JSON"
  }
];

/* ---------------- snapshots ---------------- */

export type SnapshotEntry =
  | { kind: "json"; value: unknown }
  | { kind: "text"; value: string }
  | { kind: "zip"; value: string[] }
  | { kind: "binary"; value: string };

/** Output of one generator over one corpus entry: repo-style relative path -> normalised content. */
export type Snapshot = Record<string, SnapshotEntry>;

const TEXT_EXTENSIONS = new Set(["html", "htm", "txt", "md", "toml", "yaml", "yml", "vto", "css", "js", "xml", "svg", "excalidraw", "ipynb"]);

function extension(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot > path.lastIndexOf("/") ? path.slice(dot + 1).toLowerCase() : "";
}

function sha256(buffer: Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/** Entries of a zip archive from its central directory: `name crc32 size`, sorted. */
export function zipEntries(buffer: Buffer): string[] {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
    if (buffer.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("no end-of-central-directory record");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries: string[] = [];
  for (let n = 0; n < count; n++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`bad central directory header at ${offset}`);
    const crc = buffer.readUInt32LE(offset + 16).toString(16).padStart(8, "0");
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    entries.push(`${name} ${crc} ${size}`);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries.sort();
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as object)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
    );
  }
  return value;
}

function maskCourseRoot(text: string, courseRoot?: string): string {
  if (!courseRoot) return text;
  const variants = new Set([courseRoot, courseRoot.replaceAll("\\", "/"), courseRoot.replaceAll("\\", "\\\\"), courseRoot.replaceAll("/", "\\")]);
  let out = text;
  for (const variant of [...variants].sort((a, b) => b.length - a.length)) out = out.split(variant).join("<COURSE>");
  return out;
}

/** Normalise one output file according to MASKS. */
export function normaliseFile(path: string, content: Buffer, courseRoot?: string): SnapshotEntry {
  const ext = extension(path);
  if (ext === "zip") {
    try {
      return { kind: "zip", value: zipEntries(content) };
    } catch (error) {
      return { kind: "binary", value: `unreadable zip (${(error as Error).message}) ${sha256(content)}` };
    }
  }
  if (ext === "json") {
    const text = maskCourseRoot(content.toString("utf8"), courseRoot);
    try {
      return { kind: "json", value: sortKeys(JSON.parse(text)) };
    } catch {
      return { kind: "text", value: text };
    }
  }
  if (TEXT_EXTENSIONS.has(ext) || ext === "") {
    const text = content.toString("utf8");
    // Files that are not valid UTF-8 are binary whatever their name says.
    if (!text.includes(String.fromCharCode(0xfffd))) return { kind: "text", value: maskCourseRoot(text.replace(/\r\n/g, "\n"), courseRoot) };
  }
  return { kind: "binary", value: sha256(content) };
}

/** Read a generator output folder into a snapshot. */
export function snapshotDirectory(dir: string, courseRoot?: string): Snapshot {
  const snapshot: Snapshot = {};
  const files = walk(dir, () => true, new Set()).map((path) => ({ path, rel: toPosix(path, dir) }));
  for (const { path, rel } of files.sort((a, b) => a.rel.localeCompare(b.rel))) {
    snapshot[rel] = normaliseFile(rel, readFileSync(path), courseRoot);
  }
  return snapshot;
}

/* ---------------- hunks ---------------- */

export type HunkKind = "added" | "removed" | "changed";

export interface Hunk {
  corpus: string;
  generator: string;
  file: string;
  /** Location inside a JSON file; array elements with a unique `id` are addressed as `[id]`. */
  pointer?: string;
  kind: HunkKind;
  detail: string;
}

export function formatHunk(hunk: Hunk): string {
  const where = hunk.pointer ? `${hunk.file}#${hunk.pointer}` : hunk.file;
  return `${hunk.corpus}/${hunk.generator}: ${where} (${hunk.kind}) ${hunk.detail}`;
}

function preview(value: unknown): string {
  const text = typeof value === "string" ? JSON.stringify(value) : JSON.stringify(value) ?? String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function elementKeys(items: unknown[]): string[] | undefined {
  const ids = items.map((item) =>
    item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? `[${(item as { id: string }).id}]` : undefined
  );
  if (ids.some((id) => id === undefined)) return undefined;
  return new Set(ids).size === ids.length ? (ids as string[]) : undefined;
}

/** Leaf-level differences between two JSON values, as pointer + kind + detail. */
export function jsonDifferences(base: unknown, candidate: unknown, pointer = ""): { pointer: string; kind: HunkKind; detail: string }[] {
  if (JSON.stringify(base) === JSON.stringify(candidate)) return [];
  const bothArrays = Array.isArray(base) && Array.isArray(candidate);
  const bothObjects = !bothArrays && base !== null && candidate !== null && typeof base === "object" && typeof candidate === "object" && !Array.isArray(base) && !Array.isArray(candidate);

  if (bothArrays) {
    const a = base as unknown[];
    const b = candidate as unknown[];
    const aKeys = elementKeys(a);
    const bKeys = elementKeys(b);
    const out: { pointer: string; kind: HunkKind; detail: string }[] = [];
    if (aKeys && bKeys) {
      const aMap = new Map(aKeys.map((key, i) => [key, a[i]]));
      const bMap = new Map(bKeys.map((key, i) => [key, b[i]]));
      for (const key of aKeys) {
        if (!bMap.has(key)) out.push({ pointer: `${pointer}/${key}`, kind: "removed", detail: "element removed" });
        else out.push(...jsonDifferences(aMap.get(key), bMap.get(key), `${pointer}/${key}`));
      }
      for (const key of bKeys) if (!aMap.has(key)) out.push({ pointer: `${pointer}/${key}`, kind: "added", detail: "element added" });
      const sharedOrderA = aKeys.filter((key) => bMap.has(key));
      const sharedOrderB = bKeys.filter((key) => aMap.has(key));
      if (sharedOrderA.join() !== sharedOrderB.join()) out.push({ pointer, kind: "changed", detail: "elements reordered" });
      return out;
    }
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      if (i >= b.length) out.push({ pointer: `${pointer}/${i}`, kind: "removed", detail: `was ${preview(a[i])}` });
      else if (i >= a.length) out.push({ pointer: `${pointer}/${i}`, kind: "added", detail: `now ${preview(b[i])}` });
      else out.push(...jsonDifferences(a[i], b[i], `${pointer}/${i}`));
    }
    return out;
  }

  if (bothObjects) {
    const a = base as Record<string, unknown>;
    const b = candidate as Record<string, unknown>;
    const out: { pointer: string; kind: HunkKind; detail: string }[] = [];
    for (const key of Object.keys(a)) {
      if (!(key in b)) out.push({ pointer: `${pointer}/${key}`, kind: "removed", detail: `was ${preview(a[key])}` });
      else out.push(...jsonDifferences(a[key], b[key], `${pointer}/${key}`));
    }
    for (const key of Object.keys(b)) if (!(key in a)) out.push({ pointer: `${pointer}/${key}`, kind: "added", detail: `now ${preview(b[key])}` });
    return out;
  }

  return [{ pointer: pointer || "/", kind: "changed", detail: `${preview(base)} -> ${preview(candidate)}` }];
}

/** One hunk per differing text file: the changed line range after trimming the common prefix and suffix. */
export function textDifference(base: string, candidate: string): string | undefined {
  if (base === candidate) return undefined;
  const a = base.split(/\r?\n/);
  const b = candidate.split(/\r?\n/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  const range = (from: number, to: number) => (to < from ? `after line ${from}` : from === to ? `line ${from + 1}` : `lines ${from + 1}-${to + 1}`);
  const first = b[start] ?? a[start] ?? "";
  return `${range(start, endA)} -> ${range(start, endB)}: ${preview(first.trim())}`;
}

export function diffSnapshots(corpus: string, generator: string, base: Snapshot, candidate: Snapshot): Hunk[] {
  const hunks: Hunk[] = [];
  const files = [...new Set([...Object.keys(base), ...Object.keys(candidate)])].sort();
  for (const file of files) {
    const a = base[file];
    const b = candidate[file];
    const hunk = (kind: HunkKind, detail: string, pointer?: string) => hunks.push({ corpus, generator, file, pointer, kind, detail });
    if (!b) {
      hunk("removed", "file no longer generated");
    } else if (!a) {
      hunk("added", "new file");
    } else if (a.kind !== b.kind) {
      hunk("changed", `content kind ${a.kind} -> ${b.kind}`);
    } else if (a.kind === "json") {
      for (const d of jsonDifferences(a.value, b.value)) hunk(d.kind, d.detail, d.pointer);
    } else if (a.kind === "text") {
      const detail = textDifference(a.value, b.value as string);
      if (detail) hunk("changed", detail);
    } else if (a.kind === "zip") {
      const before = new Set(a.value);
      const after = new Set(b.value as string[]);
      const removed = a.value.filter((entry) => !after.has(entry));
      const added = (b.value as string[]).filter((entry) => !before.has(entry));
      if (removed.length || added.length) hunk("changed", `zip entries -[${removed.join(", ")}] +[${added.join(", ")}]`);
    } else if (a.value !== b.value) {
      hunk("changed", `binary content ${String(a.value).slice(0, 12)} -> ${String(b.value).slice(0, 12)}`);
    }
  }
  return hunks;
}

/* ---------------- claims ---------------- */

export interface Claim {
  corpus: string;
  generator: string;
  path: string;
  pointer?: string;
  reason: string;
  /** Set only with human approval (the approve-broad-claim label) for claims that cover whole outputs. */
  approved?: boolean;
}

/** A reason must point somewhere a reviewer can check: an issue or PR, a changelog entry, or a Rule. */
const REASON_REFERENCE = /#\d+|CHANGELOG|\bRule\s+\d+/i;

export function parseClaims(text: string): { claims: Claim[]; errors: string[] } {
  const doc = (yaml.load(text) ?? {}) as { claims?: Partial<Claim>[] | null };
  const claims: Claim[] = [];
  const errors: string[] = [];
  (doc.claims ?? []).forEach((raw, index) => {
    const label = `claims[${index}]`;
    if (!raw || typeof raw !== "object") return errors.push(`${label}: not a mapping`);
    if (typeof raw.path !== "string" || raw.path === "") errors.push(`${label}: path is required`);
    if (typeof raw.reason !== "string" || !REASON_REFERENCE.test(raw.reason)) {
      errors.push(`${label}: reason must cite an issue or PR (#123), a CHANGELOG entry or a Rule`);
    }
    claims.push({
      corpus: raw.corpus ?? "*",
      generator: raw.generator ?? "*",
      path: raw.path ?? "",
      pointer: raw.pointer,
      reason: raw.reason ?? "",
      approved: raw.approved === true
    });
  });
  return { claims, errors };
}

/** A claim that would swallow every change to a whole output file set. */
export function isBroad(claim: Claim): boolean {
  const everyFile = /^\*\*?$/.test(claim.path) || claim.path === "**/*";
  const everyPointer = claim.pointer === undefined || /^\/?\*\*$/.test(claim.pointer);
  return everyFile && everyPointer;
}

function claimMatches(claim: Claim, hunk: Hunk): boolean {
  if (!globToRegExp(claim.corpus).test(hunk.corpus)) return false;
  if (!globToRegExp(claim.generator).test(hunk.generator)) return false;
  if (!globToRegExp(claim.path).test(hunk.file)) return false;
  if (claim.pointer === undefined) return true;
  return hunk.pointer !== undefined && globToRegExp(claim.pointer.replace(/^\//, "")).test(hunk.pointer.replace(/^\//, ""));
}

export interface ClaimResult {
  claimed: { hunk: Hunk; claim: Claim }[];
  unclaimed: Hunk[];
  /** Claims that matched nothing: the changelog says something changed that did not. */
  stale: Claim[];
  /** Broad claims without approval; they claim nothing until approved. */
  unapprovedBroad: Claim[];
}

/** Assign every hunk to the first matching claim. Unapproved broad claims are ignored. */
export function matchClaims(hunks: Hunk[], claims: Claim[], { approveBroad = false } = {}): ClaimResult {
  const unapprovedBroad = claims.filter((claim) => isBroad(claim) && !claim.approved && !approveBroad);
  const usable = claims.filter((claim) => !unapprovedBroad.includes(claim));
  const used = new Set<Claim>();
  const claimed: ClaimResult["claimed"] = [];
  const unclaimed: Hunk[] = [];
  for (const hunk of hunks) {
    const claim = usable.find((candidate) => claimMatches(candidate, hunk));
    if (claim) {
      used.add(claim);
      claimed.push({ hunk, claim });
    } else {
      unclaimed.push(hunk);
    }
  }
  return { claimed, unclaimed, stale: usable.filter((claim) => !used.has(claim)), unapprovedBroad };
}

/* ---------------- corpus manifest ---------------- */

export type GeneratorName = "tutors" | "tutors-lite";

export interface CorpusEntry {
  name: string;
  generators: GeneratorName[];
  /** Also tracked at upstream HEAD by the nightly corpus contract. */
  nightly: boolean;
  source: { local: string } | { repo: string; commit: string };
}

export function parseCorpusManifest(text: string): CorpusEntry[] {
  const doc = yaml.load(text) as { corpus?: Record<string, unknown>[] };
  return (doc.corpus ?? []).map((raw, index) => {
    const name = String(raw.name ?? "");
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`corpus[${index}]: name must be kebab-case`);
    const generators = (raw.generators as GeneratorName[] | undefined) ?? ["tutors", "tutors-lite"];
    for (const generator of generators) {
      if (generator !== "tutors" && generator !== "tutors-lite") throw new Error(`corpus[${index}]: unknown generator ${generator}`);
    }
    let source: CorpusEntry["source"];
    if (typeof raw.path === "string") {
      source = { local: raw.path };
    } else if (typeof raw.repo === "string" && typeof raw.commit === "string" && /^[0-9a-f]{40}$/.test(raw.commit)) {
      source = { repo: raw.repo, commit: raw.commit };
    } else {
      throw new Error(`corpus[${index}]: needs a local path, or a repo pinned by a full 40-character commit SHA`);
    }
    return { name, generators, nightly: raw.nightly === true, source };
  });
}

export function outputFolder(generator: GeneratorName): string {
  return generator === "tutors" ? "json" : "html";
}

/** Generator log lines that mean the run failed even though the process exited 0. */
export const SILENT_FAILURES: readonly RegExp[] = [/Error generating static course/, /Cannot locate course\.md/];

