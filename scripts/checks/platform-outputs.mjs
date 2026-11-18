// Rule 0774 (issue #604): the generator and tutors-lite write the same files on Windows as on Linux.
// Plain Node, no install, so it runs on a fresh Windows runner.
//
//   node scripts/checks/platform-outputs.mjs write <label>=<folder>... > outputs-<os>.json
//   node scripts/checks/platform-outputs.mjs compare <outputs-a.json> <outputs-b.json>
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * What a zip holds: each entry's name, CRC-32 and size, from its central directory. A zip's bytes also carry
 * each entry's modified time and the platform's file attributes, which differ between runners without the
 * lecturer seeing any difference, so a zip is compared by its entries.
 */
export function zipEntries(bytes) {
  let end = bytes.length - 22;
  while (end >= 0 && bytes.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) return null;
  const count = bytes.readUInt16LE(end + 10);
  let at = bytes.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (bytes.readUInt32LE(at) !== 0x02014b50) return null;
    const crc = bytes
      .readUInt32LE(at + 16)
      .toString(16)
      .padStart(8, "0");
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const name = bytes.toString("utf8", at + 46, at + 46 + nameLength);
    entries.push(`${name} ${crc} ${size}`);
    at += 46 + nameLength + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
  return entries;
}

function digestOf(file, bytes) {
  const entries = file.endsWith(".zip") ? zipEntries(bytes) : null;
  return createHash("sha256")
    .update(entries ? `zip\n${entries.join("\n")}` : bytes)
    .digest("hex");
}

/** Every file under `root`, by its path with forward slashes, to the SHA-256 of its bytes (of its entries, for a zip). */
export function outputsOf(root) {
  const files = {};
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) visit(full);
      else files[relative(root, full).split("\\").join("/")] = digestOf(name, readFileSync(full));
    }
  };
  visit(root);
  return files;
}

/**
 * What differs between two platforms' outputs, one line per file, or none. `a` and `b` map a folder label
 * (e.g. "synthetic-course/json") to outputsOf() for it.
 */
export function platformDifferences(a, b, names = ["a", "b"]) {
  const findings = [];
  for (const folder of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const left = a[folder];
    const right = b[folder];
    if (!left || !right) {
      findings.push(`${folder}: only built on ${left ? names[0] : names[1]}`);
      continue;
    }
    for (const file of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
      if (!(file in right)) findings.push(`${folder}/${file}: only on ${names[0]}`);
      else if (!(file in left)) findings.push(`${folder}/${file}: only on ${names[1]}`);
      else if (left[file] !== right[file]) findings.push(`${folder}/${file}: differs between ${names[0]} and ${names[1]}`);
    }
  }
  return findings;
}

if (process.argv[1]?.endsWith("platform-outputs.mjs")) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "write") {
    const outputs = {};
    for (const pair of rest) {
      const at = pair.indexOf("=");
      outputs[pair.slice(0, at)] = outputsOf(pair.slice(at + 1));
    }
    process.stdout.write(`${JSON.stringify(outputs, null, 2)}\n`);
  } else if (command === "compare") {
    const [first, second] = rest;
    const findings = platformDifferences(JSON.parse(readFileSync(first, "utf8")), JSON.parse(readFileSync(second, "utf8")), [first, second]);
    for (const finding of findings) process.stdout.write(`${finding}\n`);
    process.stdout.write(findings.length === 0 ? "Same files on both platforms.\n" : `${findings.length} difference(s).\n`);
    process.exit(findings.length === 0 ? 0 : 1);
  } else {
    process.stderr.write("usage: platform-outputs.mjs write <label>=<folder>... | compare <a.json> <b.json>\n");
    process.exit(2);
  }
}
