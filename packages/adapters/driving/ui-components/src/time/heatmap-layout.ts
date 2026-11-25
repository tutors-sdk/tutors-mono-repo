/**
 * Resolves once the browser has laid the page out and its web fonts have loaded (Rule 0604).
 * Heat.js measures its labels and day cells once, when it lays a heat map out; measured on a
 * fallback font, or before the first layout starts the font downloads, the day grid comes out
 * differently from one load to the next.
 */
export async function whenLayoutSettled(doc: Document): Promise<void> {
  const view = doc.defaultView;
  if (view) await new Promise<void>((resolve) => view.requestAnimationFrame(() => resolve()));
  await doc.fonts?.ready;
}
