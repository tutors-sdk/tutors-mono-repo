import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("ships the PDF worker that matches the reader and UI component dependencies", () => {
  const worker = readFileSync(new URL("../../apps/reader/static/pdf.worker.min.mjs", import.meta.url));

  for (const workspace of ["apps/reader", "packages/adapters/driving/ui-components"]) {
    const expected = readFileSync(new URL(`../../${workspace}/node_modules/pdfjs-dist/build/pdf.worker.min.mjs`, import.meta.url));
    expect(worker.equals(expected), "Refresh apps/reader/static/pdf.worker.min.mjs from pdfjs-dist when updating PDF.js").toBe(true);
  }
});
