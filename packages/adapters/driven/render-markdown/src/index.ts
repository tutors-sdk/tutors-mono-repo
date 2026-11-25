/**
 * The markdown rendering adapter: markdown-it with the Tutors plugins, Shiki for code and KaTeX
 * (loaded on demand) for maths. `markdownRenderer` implements the application's ContentRenderer
 * port; the named functions are the long-standing model-lib surface, re-exported by the facade.
 */
import type { ContentRenderer } from "@tutors/application/ports";
import { convertLoSummaryToHtml, convertLoToHtml, convertMdToHtml, loadMath, mayContainMath } from "./markdown-utils.ts";

export * from "./markdown-utils.ts";
export { link_open, podcastPlayer, quote_close, quote_open, videoPlayer, type MarkdownItInstance } from "./markdown-plugins.ts";

export const markdownRenderer: ContentRenderer = {
  renderLo: (course, lo, protocol) => convertLoToHtml(course, lo, protocol),
  renderSummary: (lo) => convertLoSummaryToHtml(lo),
  renderMarkdown: (md) => convertMdToHtml(md),
  mayContainMath,
  loadMath
};
