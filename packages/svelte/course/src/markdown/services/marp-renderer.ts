import type { Lo } from "@tutors/tutors-model-lib";
import type { Marp } from "@marp-team/marp-core";

let marp: Promise<Marp> | undefined;

/** Marp Core bundles MathJax, KaTeX and highlight.js, so it is imported only when a Marp talk is rendered. */
function getMarp(): Promise<Marp> {
  marp ??= import("@marp-team/marp-core").then(
    ({ Marp }) =>
      new Marp({
        container: { tag: "div", class: "marp-slides" },
        html: true
      })
  );
  return marp;
}

export function isMarpContent(lo: Lo): boolean {
  const marpValue = lo.frontMatter?.marp;
  if (marpValue != null && String(marpValue).toLowerCase() === "true") {
    return true;
  }
  if (lo.contentMd && /^---\s*\nmarp:\s*true/m.test(lo.contentMd)) {
    return true;
  }
  return false;
}

export function buildMarpMarkdown(lo: Lo): string {
  if (lo.contentMd.trimStart().startsWith("---")) {
    return lo.contentMd;
  }
  const fm = lo.frontMatter ?? {};
  const lines = ["---", "marp: true"];
  if (fm.theme) lines.push(`theme: ${fm.theme}`);
  if (fm.paginate) lines.push(`paginate: ${fm.paginate}`);
  lines.push("---", "");
  return lines.join("\n") + lo.contentMd;
}

export async function renderMarpSlides(markdown: string): Promise<{ html: string; css: string }> {
  return (await getMarp()).render(markdown);
}
