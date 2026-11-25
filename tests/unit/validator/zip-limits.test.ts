import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";
import { checkZip, courseFromZip, MAX_ZIP_BYTES } from "../../../packages/adapters/driven/course-archive/src/index.ts";

it("rejects archives beyond the compressed size limit before decompression", () => {
  expect(() => courseFromZip({ byteLength: MAX_ZIP_BYTES + 1 } as Uint8Array)).toThrow("1 GB");
});

it("rejects paths that leave the course folder", () => {
  expect(() => courseFromZip(zipSync({ "../course.md": strToU8("# Course") }))).toThrow("outside the course folder");
});

it("checks the expanded size from the directory before allocating a file", () => {
  const bytes = zipSync({ "course.md": strToU8("# Course") });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.length - 24; offset++) {
    if (view.getUint32(offset, true) === 0x02014b50) view.setUint32(offset + 24, 101 * 1024 * 1024, true);
  }
  expect(() => courseFromZip(bytes)).toThrow("100 MB");
});

it("checks large binary resource sizes without decompressing them", async () => {
  const bytes = zipSync({ "course.md": strToU8("# Course\n![Large](large.png)"), "large.png": new Uint8Array([1, 2, 3]) });
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.length - 46; offset++) {
    if (view.getUint32(offset, true) === 0x02014b50) {
      const nameLength = view.getUint16(offset + 28, true);
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      if (name === "large.png") view.setUint32(offset + 24, 500 * 1024 * 1024, true);
    }
  }
  expect(await checkZip(bytes)).toContainEqual(expect.objectContaining({ rule: "V009", message: expect.stringContaining("500.0 MB") }));
});

it("rejects an absolute path", () => {
  expect(() => courseFromZip(zipSync({ "/course.md": strToU8("# Course") }))).toThrow("outside the course folder");
});

it("leaves out what a Mac adds, so the one course folder is still the root", () => {
  const files = courseFromZip(zipSync({ "web/course.md": strToU8("# Course"), "__MACOSX/web/._course.md": strToU8("x"), ".DS_Store": strToU8("x") }));
  expect(Object.keys(files)).toEqual(["course.md"]);
});

it("reads a text file whatever the case of its extension, and the one-line link files, in a size check", async () => {
  const findings = await checkZip(zipSync({ "course.MD": strToU8("# Course"), "topic-01/topic.md": strToU8("# Topic"), "topic-01/web-1/weburl": strToU8("https://example.com") }));
  expect(findings.map((finding) => finding.message).join("\n")).not.toContain("binary contents");
});

it("sets the compressed limit at exactly 1 GB, and allows an archive of exactly that size", () => {
  expect(MAX_ZIP_BYTES).toBe(1024 ** 3);
  expect(() => courseFromZip({ byteLength: MAX_ZIP_BYTES } as Uint8Array)).not.toThrow("1 GB");
});

it("gives the contents of every file, binary ones too, when asked for the course's files", () => {
  const files = courseFromZip(zipSync({ "course.md": strToU8("# Course"), "course.png": new Uint8Array([1, 2, 3]) }));
  expect([...files["course.png"]]).toEqual([1, 2, 3]);
});
