import { gunzipSync, inflateRawSync } from "node:zlib";

/**
 * The read side of the two archive formats learning platforms export, enough for `tutors import` (issue #611):
 * zip (an IMS Common Cartridge) and tar, gzipped or not (a Moodle backup). Each yields its files by
 * "/"-separated path; folders are left out. No new dependency: `node:zlib` does the decompression.
 * Encryption, Zip64 and multi-disk zips are refused rather than read wrongly.
 */
export type ArchiveFiles = Map<string, Uint8Array>;

/** An archive tutors can't read, or one that names a file outside itself. */
export class ArchiveError extends Error {}

/** A path inside an archive as tutors keeps it, null for a folder; throws for one that would leave the archive. */
export function entryPath(raw: string): string | null {
  const path = raw.replaceAll("\\", "/").replace(/^(\.\/)+/, "");
  if (path === "" || path.endsWith("/")) return null;
  const parts = path.split("/");
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path) || parts.some((part) => part === ".." || part === "")) {
    throw new ArchiveError(`The archive names a file outside itself: ${raw}`);
  }
  return parts.filter((part) => part !== ".").join("/");
}

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
const keep = (files: ArchiveFiles, raw: string, bytes: Uint8Array) => {
  const path = entryPath(raw);
  if (path !== null) files.set(path, bytes);
};

/** Every file in a zip. */
export function unzip(data: Uint8Array): ArchiveFiles {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let at = data.byteLength - 22; at >= Math.max(0, data.byteLength - 22 - 0xffff); at--) {
    if (view.getUint32(at, true) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) throw new ArchiveError("This isn't a zip file.");
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (at === 0xffffffff) throw new ArchiveError("This zip is too large for tutors to read (Zip64).");
  const files: ArchiveFiles = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== 0x02014b50) throw new ArchiveError("This zip's directory is damaged.");
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const size = view.getUint32(at + 20, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const local = view.getUint32(at + 42, true);
    const name = text(data.subarray(at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    if (flags & 1) throw new ArchiveError(`${name} is encrypted.`);
    if (view.getUint32(local, true) !== 0x04034b50) throw new ArchiveError(`${name} is damaged.`);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const body = data.subarray(start, start + size);
    if (method === 0) keep(files, name, body);
    else if (method === 8) keep(files, name, new Uint8Array(inflateRawSync(body)));
    else throw new ArchiveError(`${name} is compressed in a way tutors can't read (method ${method}).`);
  }
  return files;
}

const field = (block: Uint8Array, from: number, length: number) => text(block.subarray(from, from + length)).replace(/\0.*$/s, "");

/** Every file in a tar, gzipped or not: ustar names, GNU long names and pax paths. */
export function untar(input: Uint8Array): ArchiveFiles {
  const data = input[0] === 0x1f && input[1] === 0x8b ? new Uint8Array(gunzipSync(input)) : input;
  const files: ArchiveFiles = new Map();
  let longName: string | null = null;
  for (let at = 0; at + 512 <= data.byteLength;) {
    const header = data.subarray(at, at + 512);
    if (header.every((byte) => byte === 0)) break;
    const size = parseInt(field(header, 124, 12).trim() || "0", 8);
    if (Number.isNaN(size)) throw new ArchiveError("This tar file is damaged.");
    const type = String.fromCharCode(header[156]);
    const body = data.subarray(at + 512, at + 512 + size);
    at += 512 + Math.ceil(size / 512) * 512;
    if (type === "L") longName = field(body, 0, body.byteLength);
    else if (type === "x") longName = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(text(body))?.[1] ?? longName;
    else {
      const prefix = field(header, 345, 155);
      const name = longName ?? (prefix ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100));
      longName = null;
      if (type === "0" || type === "\0") keep(files, name, body);
    }
  }
  return files;
}

/** An element of a manifest: its name and attributes without namespace prefixes, in lower case. */
export interface XmlNode {
  name: string;
  attributes: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (value: string) =>
  value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, body: string) =>
      body[0] !== "#" ? (ENTITIES[body.toLowerCase()] ?? whole) : String.fromCodePoint(body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : Number(body.slice(1))),
  );
const local = (name: string) => name.replace(/^.*:/, "").toLowerCase();
const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/gi;
const ATTRIBUTE = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

/** A small read-only XML scanner: enough for a Moodle backup's and a cartridge's manifests. Never validates. */
export function parseXml(xml: string): XmlNode {
  const root: XmlNode = { name: "", attributes: {}, children: [], text: "" };
  const open = [root];
  for (const [, cdata, closing, tag, attributes, selfClosing, chars] of xml.matchAll(TOKEN)) {
    const parent = open[open.length - 1];
    if (cdata !== undefined) parent.text += cdata;
    else if (chars !== undefined) parent.text += decode(chars);
    else if (tag === undefined) continue;
    else if (closing) {
      if (open.length > 1) open.pop();
    } else {
      const node: XmlNode = { name: local(tag), attributes: {}, children: [], text: "" };
      for (const [, name, double, single] of (attributes ?? "").matchAll(ATTRIBUTE)) node.attributes[local(name)] = decode(double ?? single);
      parent.children.push(node);
      if (!selfClosing) open.push(node);
    }
  }
  return root;
}

/** The first child of `node` with this name. */
export const child = (node: XmlNode | undefined, name: string): XmlNode | undefined => node?.children.find((each) => each.name === name);
/** Every child of `node` with this name. */
export const children = (node: XmlNode | undefined, name: string): XmlNode[] => node?.children.filter((each) => each.name === name) ?? [];
/** The trimmed text of the child with this name, or "". */
export const textOf = (node: XmlNode | undefined, name: string): string => child(node, name)?.text.trim() ?? "";
/** Every node under `node`, at any depth, with this name. */
export const descendants = (node: XmlNode, name: string): XmlNode[] => node.children.flatMap((each) => [...(each.name === name ? [each] : []), ...descendants(each, name)]);
