import { describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import { ArchiveError, child, children, descendants, entryPath, parseXml, textOf, untar, unzip } from "../../../packages/jsr/create/src/archive.ts";
import { tar, zip } from "../../support/course-archives.ts";

const read = (files: Map<string, Uint8Array>) => Object.fromEntries([...files].map(([path, bytes]) => [path, new TextDecoder().decode(bytes)]));

describe("a path inside an archive (issue #611)", () => {
  it("is kept relative and /-separated, and a folder is null", () => {
    expect(entryPath("week 1/slides.pdf")).toBe("week 1/slides.pdf");
    expect(entryPath("./././week 1\\slides.pdf")).toBe("week 1/slides.pdf");
    expect(entryPath("a/./b.pdf")).toBe("a/b.pdf");
    expect(entryPath("week 1/")).toBeNull();
    expect(entryPath("")).toBeNull();
    expect(entryPath("./")).toBeNull();
  });

  it.each(["../x.pdf", "a/../../x.pdf", "/etc/passwd", "C:/x.pdf", "c:x.pdf", "a//b.pdf"])("refuses %s, which leaves the archive", (path) => {
    expect(() => entryPath(path)).toThrow(ArchiveError);
    expect(() => entryPath(path)).toThrow(`The archive names a file outside itself: ${path}`);
  });
});

describe("unzip", () => {
  it("reads stored and deflated files and leaves folders out", () => {
    const files = unzip(zip({ "a.txt": "stored text", "b/c.txt": "deflated text ".repeat(50), "b/": "" }, ["a.txt", "b/"]));
    expect(read(files)).toEqual({ "a.txt": "stored text", "b/c.txt": "deflated text ".repeat(50) });
  });

  it("reads a zip with a comment after its directory", () => {
    const plain = zip({ "a.txt": "x" });
    const commented = new Uint8Array(plain.byteLength + 5);
    commented.set(plain);
    commented.set(new TextEncoder().encode("hello"), plain.byteLength);
    new DataView(commented.buffer).setUint16(plain.byteLength - 2, 5, true);
    expect(read(unzip(commented))).toEqual({ "a.txt": "x" });
  });

  it("refuses what isn't a zip, or a zip it can't read rightly", () => {
    expect(() => unzip(new TextEncoder().encode("not a zip at all, just some text here"))).toThrow("This isn't a zip file.");
    const encrypted = zip({ "a.txt": "x" }, ["a.txt"]);
    const end = encrypted.byteLength - 22;
    const central = new DataView(encrypted.buffer).getUint32(end + 16, true);
    new DataView(encrypted.buffer).setUint16(central + 8, 1, true);
    expect(() => unzip(encrypted)).toThrow("a.txt is encrypted.");
    const odd = zip({ "a.txt": "x" }, ["a.txt"]);
    new DataView(odd.buffer).setUint16(new DataView(odd.buffer).getUint32(odd.byteLength - 22 + 16, true) + 10, 12, true);
    expect(() => unzip(odd)).toThrow("a.txt is compressed in a way tutors can't read (method 12).");
    const damaged = zip({ "a.txt": "x" }, ["a.txt"]);
    damaged[0] = 0;
    expect(() => unzip(damaged)).toThrow("a.txt is damaged.");
    const directory = zip({ "a.txt": "x" }, ["a.txt"]);
    directory[new DataView(directory.buffer).getUint32(directory.byteLength - 22 + 16, true)] = 0;
    expect(() => unzip(directory)).toThrow("This zip's directory is damaged.");
    const big = zip({ "a.txt": "x" });
    new DataView(big.buffer).setUint32(big.byteLength - 22 + 16, 0xffffffff, true);
    expect(() => unzip(big)).toThrow("Zip64");
  });

  it("refuses a zip that names a file outside itself", () => {
    expect(() => unzip(zip({ "../evil.sh": "x" }))).toThrow(ArchiveError);
  });
});

describe("untar", () => {
  it("reads a gzipped or plain tar, with long names", () => {
    const long = `${"deep/".repeat(25)}file.txt`;
    const files = { "a.txt": "first", "b/c.txt": "x".repeat(700), [long]: "long" };
    expect(read(untar(tar(files)))).toEqual(files);
    expect(read(untar(tar(files, false)))).toEqual(files);
  });

  it("reads a ustar prefix and a pax path, and skips links and folders", () => {
    const plain = tar({ "name.txt": "body" }, false);
    plain.set(new TextEncoder().encode("course"), 345);
    expect(read(untar(plain))).toEqual({ "course/name.txt": "body" });
    const pax = tar({ PaxHeader: "27 path=from/pax/header.txt\n", "short.txt": "body" }, false);
    pax[156] = "x".charCodeAt(0);
    expect(read(untar(gzipSync(pax)))).toEqual({ "from/pax/header.txt": "body" });
    const link = tar({ link: "", "dir/": "" }, false);
    link[156] = "2".charCodeAt(0);
    expect(read(untar(link))).toEqual({});
  });

  it("refuses a damaged header", () => {
    const bad = tar({ "a.txt": "x" }, false);
    bad.set(new TextEncoder().encode("zzzzzzzzzzz"), 124);
    expect(() => untar(bad)).toThrow("This tar file is damaged.");
  });
});

describe("parseXml", () => {
  const xml = `<?xml version="1.0"?><!DOCTYPE x><!-- note --><cc:manifest xmlns:cc="urn" ID='m1'>
    <Item identifierref="r1" title="A &amp; B"><title>Week &#49; &#x32; &lt;3&gt; &quot;q&quot; &apos;a&apos; &nope;</title><br/></Item>
    <item><title><![CDATA[<b>raw</b>]]></title></item></cc:manifest>`;
  const root = parseXml(xml);
  const manifest = child(root, "manifest")!;

  it("drops namespace prefixes and case from names, and decodes text and attributes", () => {
    expect(manifest.attributes).toEqual({ cc: "urn", id: "m1" });
    const [first, second] = children(manifest, "item");
    expect(first.attributes).toEqual({ identifierref: "r1", title: "A & B" });
    expect(textOf(first, "title")).toBe(`Week 1 2 <3> "q" 'a' &nope;`);
    expect(child(first, "br")?.children).toEqual([]);
    expect(textOf(second, "title")).toBe("<b>raw</b>");
    expect(descendants(root, "title")).toHaveLength(2);
    expect(textOf(second, "missing")).toBe("");
    expect(children(undefined, "item")).toEqual([]);
  });

  it("survives a stray closing tag", () => {
    expect(child(parseXml("</a><b>x</b>"), "b")?.text).toBe("x");
  });
});
