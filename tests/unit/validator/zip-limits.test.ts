import { strToU8, zipSync } from "fflate";
import { expect, it } from "vitest";
import { checkZip, courseFromZip, MAX_ZIP_BYTES } from "../../../packages/svelte/course/src/validation/check.ts";

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
