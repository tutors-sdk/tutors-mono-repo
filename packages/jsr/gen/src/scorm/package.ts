/**
 * Locating and unpacking an imported SCORM package.
 *
 * An author can drop either shape into a `scorm-*` folder and have it work: the package
 * already unzipped, or the `.zip` exactly as it was downloaded from the vendor. The zip
 * form is worth supporting because it is what every SCORM authoring tool actually hands
 * you, and asking authors to unpack it by hand is an easy step to get wrong.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { parseManifest, type ScormPackageInfo } from "./manifest-parser.ts";
import { unzip } from "./zip.ts";

const MANIFEST_FILE = "imsmanifest.xml";

/**
 * Subfolder the package contents are published under, below the learning object's own folder.
 *
 * A SCORM package almost always launches from `index.html`, which is exactly the name the
 * static generator gives the learning object's own page. Keeping the package one level
 * down means the two never collide.
 */
export const SCORM_CONTENT_FOLDER = "package";

export interface ScormSource {
  info: ScormPackageInfo;
  /** Path of the `.zip` when the package is still packed; empty when it is already unpacked. */
  zipFile: string;
}

/**
 * Find the manifest inside a zip.
 *
 * Some tools zip the package directory rather than its contents, which buries the
 * manifest one level down. The shallowest manifest wins, and its directory becomes the
 * package root that all other entries are made relative to.
 */
function findManifestEntry(entries: Record<string, Uint8Array>): { name: string; root: string } | null {
  let best: { name: string; root: string } | null = null;
  for (const name of Object.keys(entries)) {
    if (path.posix.basename(name).toLowerCase() !== MANIFEST_FILE) continue;
    const root = name.slice(0, name.length - path.posix.basename(name).length);
    if (!best || root.length < best.root.length) best = { name, root };
  }
  return best;
}

function readZip(zipFile: string): Record<string, Uint8Array> {
  return unzip(new Uint8Array(fs.readFileSync(zipFile)));
}

/**
 * Identify the SCORM package among a learning object's files.
 *
 * @param files absolute paths of the files directly inside the `scorm-*` folder
 * @returns the package details, or null when the folder holds no recognisable package
 */
export function readScormPackage(files: string[]): ScormSource | null {
  const manifest = files.find((file) => path.basename(file).toLowerCase() === MANIFEST_FILE);
  if (manifest) {
    return { info: parseManifest(fs.readFileSync(manifest, "utf8")), zipFile: "" };
  }

  for (const zipFile of files.filter((file) => file.toLowerCase().endsWith(".zip"))) {
    const entries = readZip(zipFile);
    const entry = findManifestEntry(entries);
    if (!entry) continue;
    const info = parseManifest(new TextDecoder().decode(entries[entry.name]));
    return { info, zipFile };
  }

  return null;
}

/**
 * Unpack a zipped SCORM package so the LMS — Tutors or otherwise — can serve its files.
 *
 * Extraction happens into the generated output rather than back into the author's source
 * tree, so running the generator never modifies the course being generated.
 */
export function extractScormPackage(zipFile: string, destFolder: string): void {
  const entries = readZip(zipFile);
  const manifest = findManifestEntry(entries);
  const root = manifest ? manifest.root : "";

  for (const [name, contents] of Object.entries(entries)) {
    // Directory entries carry no data and are recreated implicitly by mkdirSync below.
    if (name.endsWith("/")) continue;
    if (root && !name.startsWith(root)) continue;
    const relative = name.slice(root.length);
    // Guard against archive entries that try to escape the destination.
    const target = path.resolve(destFolder, relative);
    if (!target.startsWith(path.resolve(destFolder) + path.sep)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
}
