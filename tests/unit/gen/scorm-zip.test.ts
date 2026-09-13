import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { unzip } from "../../../packages/jsr/gen/src/scorm/zip.ts";
import { extractScormPackage, readScormPackage, SCORM_CONTENT_FOLDER } from "../../../packages/jsr/gen/src/scorm/package.ts";
import { buildZip } from "../../support/zip-writer.ts";

const manifest = `<manifest identifier="VENDOR">
  <metadata><schemaversion>1.2</schemaversion></metadata>
  <organizations default="O"><organization identifier="O"><title>Vendor Quiz</title><item identifierref="R" /></organization></organizations>
  <resources><resource identifier="R" adlcp:scormtype="sco" href="launch.html" /></resources>
</manifest>`;

const temporary: string[] = [];

function scratch(): string {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "tutors-zip-"));
  temporary.push(folder);
  return folder;
}

/** Write an archive to disk and return its path. */
function writeZip(folder: string, name: string, entries: Parameters<typeof buildZip>[0]): string {
  const file = path.join(folder, name);
  fs.writeFileSync(file, buildZip(entries));
  return file;
}

afterEach(() => {
  while (temporary.length) fs.rmSync(temporary.pop()!, { recursive: true, force: true });
});

describe("unzip", () => {
  it("reads stored entries", () => {
    const entries = unzip(buildZip([{ name: "a.txt", contents: "hello" }]));
    expect(new TextDecoder().decode(entries["a.txt"])).toBe("hello");
  });

  it("reads deflated entries", () => {
    // Long enough that deflate genuinely compresses, so the inflate path is exercised.
    const contents = "tutors ".repeat(500);
    const entries = unzip(buildZip([{ name: "a.txt", contents, deflate: true }]));
    expect(new TextDecoder().decode(entries["a.txt"])).toBe(contents);
  });

  it("omits directory entries", () => {
    const entries = unzip(buildZip([{ name: "assets/" }, { name: "assets/a.css", contents: "body{}" }]));
    expect(Object.keys(entries)).toEqual(["assets/a.css"]);
  });

  it("preserves nested paths", () => {
    const entries = unzip(buildZip([{ name: "shared/js/quiz.js", contents: "/* q */" }]));
    expect(Object.keys(entries)).toEqual(["shared/js/quiz.js"]);
  });

  it("rejects something that is not a zip at all", () => {
    expect(() => unzip(new TextEncoder().encode("this is not a zip"))).toThrow(/not a zip archive/);
  });

  it("rejects an archive whose central directory is corrupt", () => {
    const data = buildZip([{ name: "a.txt", contents: "hello" }]);
    // Point the end-of-central-directory record at the payload rather than the directory.
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    view.setUint32(data.byteLength - 22 + 16, 0, true);
    expect(() => unzip(data)).toThrow(/central directory is corrupt/);
  });
});

describe("readScormPackage", () => {
  it("prefers an unpacked manifest sitting in the folder", () => {
    const folder = scratch();
    fs.writeFileSync(path.join(folder, "imsmanifest.xml"), manifest);
    const source = readScormPackage([path.join(folder, "imsmanifest.xml")]);

    expect(source?.zipFile).toBe("");
    expect(source?.info.launchFile).toBe("launch.html");
  });

  it("reads the manifest from inside a zip", () => {
    const folder = scratch();
    const zip = writeZip(folder, "vendor.zip", [
      { name: "imsmanifest.xml", contents: manifest, deflate: true },
      { name: "launch.html", contents: "<html></html>" },
    ]);
    const source = readScormPackage([zip]);

    expect(source?.zipFile).toBe(zip);
    expect(source?.info.title).toBe("Vendor Quiz");
  });

  it("finds a manifest buried one level down, as tools that zip the folder produce", () => {
    const folder = scratch();
    const zip = writeZip(folder, "vendor.zip", [
      { name: "package/imsmanifest.xml", contents: manifest },
      { name: "package/launch.html", contents: "<html></html>" },
    ]);
    expect(readScormPackage([zip])?.info.launchFile).toBe("launch.html");
  });

  it("returns null when the folder holds no recognisable package", () => {
    const folder = scratch();
    fs.writeFileSync(path.join(folder, "notes.txt"), "package still to come");
    expect(readScormPackage([path.join(folder, "notes.txt")])).toBeNull();
  });

  it("returns null when a zip contains no manifest", () => {
    const folder = scratch();
    const zip = writeZip(folder, "not-scorm.zip", [{ name: "readme.txt", contents: "nothing here" }]);
    expect(readScormPackage([zip])).toBeNull();
  });
});

describe("extractScormPackage", () => {
  it("unpacks relative to the manifest, not to the archive root", () => {
    const folder = scratch();
    const zip = writeZip(folder, "vendor.zip", [
      { name: "package/imsmanifest.xml", contents: manifest },
      { name: "package/shared/launch.html", contents: "<html>launch</html>" },
    ]);
    const destination = path.join(folder, SCORM_CONTENT_FOLDER);

    extractScormPackage(zip, destination);

    expect(fs.existsSync(path.join(destination, "imsmanifest.xml"))).toBe(true);
    expect(fs.readFileSync(path.join(destination, "shared", "launch.html"), "utf8")).toBe("<html>launch</html>");
    // The wrapping folder must not be reproduced, or every href would be one level out.
    expect(fs.existsSync(path.join(destination, "package"))).toBe(false);
  });

  it("skips entries that would escape the destination", () => {
    const folder = scratch();
    const zip = writeZip(folder, "hostile.zip", [
      { name: "imsmanifest.xml", contents: manifest },
      { name: "../escaped.txt", contents: "should never be written" },
      { name: "nested/../../escaped-too.txt", contents: "should never be written" },
    ]);
    const destination = path.join(folder, "out");

    extractScormPackage(zip, destination);

    expect(fs.existsSync(path.join(destination, "imsmanifest.xml"))).toBe(true);
    expect(fs.existsSync(path.join(folder, "escaped.txt"))).toBe(false);
    expect(fs.existsSync(path.join(folder, "escaped-too.txt"))).toBe(false);
  });

  it("ignores entries outside the manifest's own folder", () => {
    const folder = scratch();
    const zip = writeZip(folder, "vendor.zip", [
      { name: "package/imsmanifest.xml", contents: manifest },
      { name: "notes/readme.txt", contents: "not part of the package" },
    ]);
    const destination = path.join(folder, "out");

    extractScormPackage(zip, destination);

    expect(fs.existsSync(path.join(destination, "imsmanifest.xml"))).toBe(true);
    expect(fs.existsSync(path.join(destination, "readme.txt"))).toBe(false);
  });
});
