import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "npm:js-yaml@^4";
import archiver from "npm:archiver@^7";

export function removeFirstLine(str: string): string {
  return str.split("\n").slice(1).join("\n");
}

export function writeFile(
  folder: string,
  filename: string,
  contents: string,
): void {
  if (!fs.existsSync(folder)) {
    //sh.mkdir(folder);
    fs.mkdirSync(folder, { recursive: true });
  }
  return fs.writeFileSync(folder + "/" + filename, contents);
}

export function findFirstMatchingString(
  strings: string[],
  search: string,
  courseRoot: string,
): string {
  search = search.replace(courseRoot, "");
  for (const str of strings) {
    if (search.includes(str)) {
      if (str === "/topic" && search.slice(1).includes("/")) {
        return "unknown";
      } else {
        return str.slice(1);
      }
    }
  }
  return "unknown";
}

export function findLastMatchingString(
  loTypes: string[],
  path: string,
  courseRoot: string,
): string {
  path = path.replace(courseRoot, "");
  const segments = path.split("/");
  const sortedTypes = [...loTypes].sort((a, b) => b.length - a.length);
  for (let i = segments.length - 1; i >= 0; i--) {
    for (let j = 0; j < sortedTypes.length; j++) {
      const loType = sortedTypes[j].slice(1);
      if (segments[i].startsWith(loType)) {
        return loType;
      }
    }
  }
  return "unknown";
}

export function getFileName(filePath: string) {
  const fileName = filePath.replace(/^.*[\\\/]/, "");
  return fileName;
}

export function getFileType(fileName: string): string {
  if (fileName.includes(".")) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return fileName.split(".").pop()!;
  } else {
    return "";
  }
}

export function readWholeFile(path: string): string {
  if (fs.existsSync(path)) {
    const array = fs.readFileSync(path).toString();
    return array;
  } else {
    process.stderr.write(`unable to locate ${path}\n`);
  }
  return "";
}

export function readFirstLineFromFile(path: string): string {
  if (fs.existsSync(path)) {
    const array = fs.readFileSync(path).toString().split("\n");
    return array[0].replace("\r", "");
  } else {
    process.stderr.write(`unable to locate ${path}\n`);
  }
  return "";
}

export function getHeaderFromBody(body: string): string {
  let header = "";
  const array = body.split("\n");
  if (array[0][0] === "#") {
    header = array[0].substring(1);
  } else {
    header = array[0];
  }
  // "# Title\r\n" is the title "Title", not " Title\r"
  return header.trim();
}

export function withoutHeaderFromBody(body: string): string {
  let content = body;
  const line1 = content.indexOf("\n");
  content = content.substring(line1 + 1, content.length);
  content = content.trim();
  const line2 = content.indexOf("\n");
  if (line2 > -1) {
    content = content.substring(0, line2);
  }
  return content;
}

export function copyFolder(src: string, dest: string): void {
  try {
    // Delete destination if it exists to ensure clean overwrite
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }

    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
      // Create destination directory and copy contents
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(src, dest, { recursive: true });
    } else {
      // For single file, ensure parent directory exists
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error copying folder from ${src} to ${dest}: ${message}\n`);
    throw error;
  }
}

export function copyFile(src: string, dest: string): void {
  try {
    fs.cpSync(src, dest, { force: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error copying file from ${src} to ${dest}: ${message}\n`);
    throw error;
  }
}

/**
 * True when `dest` already holds a copy of `src` from an earlier build: the same size and the same modified
 * time, which copyFileToFolder keeps on every copy (Rule 0766). Reads only the two files' metadata.
 */
export function isSameCopy(src: string, dest: string): boolean {
  try {
    const [from, to] = [fs.statSync(src), fs.statSync(dest)];
    return from.isFile() && to.isFile() && from.size === to.size && Math.trunc(from.mtimeMs) === Math.trunc(to.mtimeMs);
  } catch {
    return false;
  }
}

export function copyFileToFolder(src: string, dest: string): void {
  try {
    if (fs.existsSync(src)) {
      const target = path.join(dest, path.basename(src));
      // Rule 0766: a file copied by an earlier build and unchanged since is left as it is, so a rebuild
      // copies only what changed. The copy keeps the source's modified time, which is how the next build knows.
      if (isSameCopy(src, target)) return;
      fs.mkdirSync(dest, { recursive: true });
      fs.cpSync(src, target, {
        recursive: true,
        force: true,
        preserveTimestamps: true,
      });
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Error copying file from ${src} to folder ${dest}: ${message}\n`);
    throw error;
  }
}

export function readYamlFile(yamlFilePath: string): any {
  let yamlData = null;
  try {
    yamlData = yaml.load(fs.readFileSync(yamlFilePath, "utf8"));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Tutors encountered an error reading ${yamlFilePath}: ${message}. Review this file and try again.`,
      { cause: error },
    );
  }
  return yamlData;
}

/**
 * The names of the entries in a zip file, read from its central directory; null when it isn't there or
 * isn't a zip Tutors can read.
 */
export function zipEntryNames(zipPath: string): string[] | null {
  try {
    const zip = fs.readFileSync(zipPath);
    // The end of central directory record: signature 0x06054b50, in the last 22 bytes plus any comment.
    for (let end = zip.length - 22; end >= Math.max(0, zip.length - 22 - 0xffff); end--) {
      if (zip.readUInt32LE(end) !== 0x06054b50) continue;
      const count = zip.readUInt16LE(end + 10);
      let at = zip.readUInt32LE(end + 16);
      const names: string[] = [];
      for (let i = 0; i < count; i++) {
        if (zip.readUInt32LE(at) !== 0x02014b50) return null;
        const nameLength = zip.readUInt16LE(at + 28);
        const extraLength = zip.readUInt16LE(at + 30);
        const commentLength = zip.readUInt16LE(at + 32);
        names.push(zip.toString("utf8", at + 46, at + 46 + nameLength));
        at += 46 + nameLength + extraLength + commentLength;
      }
      return names;
    }
    return null;
  } catch {
    return null;
  }
}

/** The name each file has inside a PDF zip: its place in the list, then its own name ("03-week-3.pdf"). */
export const zipEntryName = (file: string, index: number) => `${index.toString().padStart(2, "0")}-${path.basename(file)}`;

/**
 * True when the zip at `outputPath` already holds exactly these files, under the names compressToZip gives
 * them, and was written after the newest of them changed (Rule 0767). Then building it again would write the
 * same zip.
 */
export function isZipUpToDate(files: string[], outputPath: string): boolean {
  try {
    const present = files.filter((file) => fs.existsSync(file));
    const names = zipEntryNames(outputPath);
    if (names === null) return false;
    // archiver adds entries in the order their reads finish, so compare the names, not their order.
    const expected = files.map(zipEntryName).filter((_, index) => fs.existsSync(files[index])).sort();
    const found = [...names].sort();
    if (found.length !== expected.length || found.some((name, index) => name !== expected[index])) return false;
    const written = fs.statSync(outputPath).mtimeMs;
    return present.every((file) => fs.statSync(file).mtimeMs <= written);
  } catch {
    return false;
  }
}

export async function compressToZip(files: string[], outputPath: string) {
  // Rule 0767: zipping every PDF again at the highest compression is most of a rebuild; skip it when nothing in it changed.
  if (isZipUpToDate(files, outputPath)) return;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const output = fs.createWriteStream(outputPath);
  const archive = archiver("zip", {
    zlib: { level: 9 }, // Maximum compression level
  });
  const written = new Promise<void>((done, fail) => {
    output.once("close", () => done());
    output.once("error", fail);
  });
  archive.pipe(output);
  for (const [index, file] of files.entries()) {
    if (fs.existsSync(file)) archive.file(file, { name: zipEntryName(file, index) });
  }
  await archive.finalize();
  await written;
}
