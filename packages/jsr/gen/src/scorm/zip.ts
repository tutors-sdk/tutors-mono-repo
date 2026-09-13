/**
 * Minimal read side of the ZIP format, enough to open an imported SCORM package.
 *
 * `archiver` — already a dependency — only writes archives, and Node has no built-in
 * reader. Rather than take on a decompression library, this walks the central directory
 * itself and hands the payload to `node:zlib`, which does the only genuinely hard part.
 *
 * Scope is deliberately narrow: stored and deflated entries, no encryption, no Zip64,
 * no multi-disk archives. Anything outside that raises rather than returning something
 * subtly wrong, because the caller is about to publish the result to learners.
 */

import { inflateRawSync } from "node:zlib";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const ZIP64_MARKER = 0xffffffff;

const STORED = 0;
const DEFLATED = 8;

/** Largest possible trailing comment, and so the furthest back the EOCD can be. */
const MAX_COMMENT_LENGTH = 0xffff;

/** Locate the End of Central Directory record by scanning backwards from the tail. */
function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - MAX_COMMENT_LENGTH - 22);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

/**
 * Read every file in a zip archive.
 *
 * @returns entry paths (forward-slashed, as stored) mapped to their decompressed bytes;
 *          directory entries are omitted
 * @throws if the archive is not a readable zip, or uses a feature outside the scope above
 */
export function unzip(data: Uint8Array): Record<string, Uint8Array> {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd === -1) {
    throw new Error("not a zip archive: no end-of-central-directory record found");
  }

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (offset === ZIP64_MARKER || entryCount === 0xffff) {
    throw new Error("Zip64 archives are not supported; please unpack the SCORM package by hand");
  }

  const decoder = new TextDecoder();
  const files: Record<string, Uint8Array> = {};

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > data.byteLength || view.getUint32(offset, true) !== CENTRAL_HEADER_SIGNATURE) {
      throw new Error("zip central directory is corrupt");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(data.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;

    // Bit 0 of the general purpose flags means the entry is encrypted.
    if (flags & 0x1) {
      throw new Error(`zip entry "${name}" is encrypted`);
    }
    // Trailing slash is the convention for a directory entry; it carries no data.
    if (name.endsWith("/")) continue;

    if (view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) {
      throw new Error(`zip entry "${name}" has no local header`);
    }
    // The local header repeats the name and extra fields, at its own lengths.
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    const payload = data.subarray(dataStart, dataStart + compressedSize);

    if (method === STORED) {
      files[name] = payload;
    } else if (method === DEFLATED) {
      files[name] = new Uint8Array(inflateRawSync(payload));
    } else {
      throw new Error(`zip entry "${name}" uses unsupported compression method ${method}`);
    }
  }

  return files;
}
