import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// TalkMozilla in ui-components is the only importer of pdfjs-dist, so its copy is the one the reader bundles.
it("ships the PDF worker that matches the UI components' pdfjs-dist", () => {
  const worker = readFileSync(new URL("../../apps/reader/static/pdf.worker.min.mjs", import.meta.url));
  const workspace = "packages/svelte/ui-components";
  const expected = readFileSync(new URL(`../../${workspace}/node_modules/pdfjs-dist/build/pdf.worker.min.mjs`, import.meta.url));
  expect(worker.equals(expected), "Refresh apps/reader/static/pdf.worker.min.mjs from pdfjs-dist when updating PDF.js").toBe(true);
});
