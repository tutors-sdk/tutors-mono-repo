import { describe, it, expect } from "vitest";
import { convertMdToHtml, loadMath, mayContainMath } from "../../../packages/jsr/model/src/utils/markdown-utils";

/**
 * KaTeX is registered on demand (loadMath) so browser bundles skip it until a
 * course needs it. The reader decides with mayContainMath, so that check must
 * never say "no" for markdown whose output math would change.
 */

const withoutDollars = [
  "# Heading\n\nParagraph with **bold**, _em_, `code` and a [link](https://tutors.dev).",
  "- one\n- two\n\n1. first\n2. second",
  "| a | b |\n| - | - |\n| 1 | 2 |",
  "> quote\n\nText with a footnote[^1].\n\n[^1]: The note.",
  "Term\n: Definition",
  "H~2~O and x^2^ and ==marked== :smile:",
  "[[toc]]\n\n## One\n\n### Two",
  "```bash\necho hello\n```",
  "\\(x\\) and \\[y\\] are not math delimiters here",
  "<div class=\"raw\">html</div>"
];

const withMath = ["$E=mc^2$", "Inline $a^2 + b^2 = c^2$ math.", "$$\n\\int_0^1 x\\,dx\n$$"];

describe("on-demand math", () => {
  const before = new Map<string, string>();

  it("does not render math before loadMath", () => {
    for (const md of [...withoutDollars, ...withMath]) before.set(md, convertMdToHtml(md));
    for (const md of withMath) expect(before.get(md)).not.toContain('class="katex"');
  });

  it("flags every math sample and none of the others", () => {
    for (const md of withMath) expect(mayContainMath(md)).toBe(true);
    for (const md of withoutDollars) expect(mayContainMath(md)).toBe(false);
  });

  it("renders math after loadMath, and markdown without $ is unchanged by it", async () => {
    await loadMath();
    for (const md of withMath) expect(convertMdToHtml(md)).toContain('class="katex"');
    for (const md of withoutDollars) expect(convertMdToHtml(md)).toBe(before.get(md));
  });

  it("registers the plugin once however often it is called", async () => {
    const once = convertMdToHtml(withMath[1]);
    await Promise.all([loadMath(), loadMath()]);
    expect(convertMdToHtml(withMath[1])).toBe(once);
    expect(convertMdToHtml(withMath[1]).match(/class="katex"/g)).toHaveLength(1);
  });
});
