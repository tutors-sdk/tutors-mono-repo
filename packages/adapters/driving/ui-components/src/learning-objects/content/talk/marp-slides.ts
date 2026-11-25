import { sanitizeMarpSectionHtml } from "@tutors/ui-primitives/utils/sanitize";

// Course authors can write raw HTML into a Marp talk, so nothing Marp renders reaches {@html} unsanitized.
// DOMPurify drops HTML inside SVG foreignObject, so each section is sanitized alone and the stage that
// Marp's CSS selects on (svg > foreignObject > section) is rebuilt from its numeric attributes only.
const STAGE_ATTRS: Record<string, string[]> = { svg: ["viewBox"], foreignobject: ["width", "height", "x", "y"] };
const NUMERIC = /^[\d.%\s-]+$/;

function stageAttrs(el: Element): string {
  return STAGE_ATTRS[el.localName.toLowerCase()]
    .map((name) => [name, el.getAttribute(name)] as const)
    .filter(([, value]) => value !== null && NUMERIC.test(value))
    .map(([name, value]) => ` ${name}="${value}"`)
    .join("");
}

function sections(parent: Element): string {
  return Array.from(parent.children)
    .filter((child) => child.localName === "section")
    .map((section) => sanitizeMarpSectionHtml(section.outerHTML))
    .join("");
}

function svgSlide(svg: Element): string {
  const stages = Array.from(svg.children)
    .filter((child) => child.localName.toLowerCase() === "foreignobject")
    .map((fo) => `<foreignObject${stageAttrs(fo)}>${sections(fo)}</foreignObject>`);
  return `<svg data-marpit-svg=""${stageAttrs(svg)}>${stages.join("")}</svg>`;
}

/** Splits Marp's rendered deck into one sanitized markup string per slide, ready for `{@html}`. */
export function marpSlideElements(html: string): string[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const svgs = doc.querySelectorAll("svg[data-marpit-svg]");
  if (svgs.length > 0) {
    return Array.from(svgs).map(svgSlide);
  }
  return Array.from(doc.querySelectorAll("section")).map((s) => sanitizeMarpSectionHtml(s.outerHTML));
}
