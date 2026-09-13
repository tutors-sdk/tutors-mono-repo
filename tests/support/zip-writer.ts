/**
 * Builds a zip archive in memory, so tests can feed a realistic vendor package to the
 * reader in `packages/jsr/gen/src/scorm/zip.ts`.
 *
 * `archiver` is the repo's zip writer, but it is aliased to a shim under vitest and only
 * writes to a stream. Emitting the bytes directly keeps the test synchronous and lets it
 * produce the shapes that matter here — deflated and stored entries, directory entries,
 * and paths a well-behaved tool would never emit.
 *
 * Only the fields `unzip` actually reads are filled in; CRCs are left at zero because it
 * does not verify them.
 */

import { deflateRawSync } from "node:zlib";

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;

const STORED = 0;
const DEFLATED = 8;

export interface ZipEntry {
  /** Forward-slashed path as stored in the archive; a trailing slash means a directory. */
  name: string;
  contents?: string;
  /** Compress the entry, as a real authoring tool would. Stored otherwise. */
  deflate?: boolean;
}

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.contents ?? "", "utf8");
    const isDirectory = entry.name.endsWith("/");
    const method = entry.deflate && !isDirectory ? DEFLATED : STORED;
    const payload = method === DEFLATED ? deflateRawSync(raw) : raw;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + payload.length;
  }

  const central = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return new Uint8Array(Buffer.concat([...locals, central, eocd]));
}
