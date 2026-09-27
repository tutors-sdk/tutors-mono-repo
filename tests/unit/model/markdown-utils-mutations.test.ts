import { afterEach, describe, expect, it } from "vitest";
import {
  convertLabToHtml,
  convertLoSummaryToHtml,
  convertLoToHtml,
  convertMdToHtml,
  convertNoteToHtml,
  initHighlighter,
  mayContainMath,
} from "../../../packages/jsr/model/src/utils/markdown-utils";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeCourse(overrides: Record<string, unknown> = {}): any {
  return { courseId: "c1", courseUrl: "host.com/c1", los: [], ...overrides };
}

function makeLo(type: string, overrides: Record<string, unknown> = {}): any {
  return {
    type,
    id: `${type}-1`,
    title: type,
    summary: "",
    contentMd: "",
    route: `/${type}/c1/topic/${type}-1`,
    hide: false,
    frontMatter: {},
    ...overrides,
  };
}

/** A fake shiki-like highlighter that records its calls. */
function makeHighlighter(failOnLang = false) {
  const calls: { str: string; opts: any }[] = [];
  return {
    calls,
    codeToHtml(str: string, opts: any) {
      calls.push({ str, opts });
      if (failOnLang && opts.lang !== "") throw new Error("unknown lang");
      return `<pre class="hl" data-lang="${opts.lang}" data-theme="${opts.theme}">${str}</pre>`;
    },
  };
}

// ===========================================================================
// markdownIt configuration and plugins
// ===========================================================================
describe("markdownIt configuration — mutation killing", () => {
  it("passes raw HTML through (html: true)", () => {
    expect(convertMdToHtml("a <span>h</span>")).toBe("<p>a <span>h</span></p>\n");
  });

  it("emits HTML-style (not XHTML) hard breaks and ignores soft breaks", () => {
    expect(convertMdToHtml("a  \nb\n\nc\nd")).toBe("<p>a<br>\nb</p>\n<p>c\nd</p>\n");
  });

  it("does not linkify bare URLs", () => {
    expect(convertMdToHtml("see https://x.com")).toBe("<p>see https://x.com</p>\n");
  });

  it("applies typographer replacements and curly quotes", () => {
    expect(convertMdToHtml(`(c) "q" 'r'`)).toBe("<p>© “q” ‘r’</p>\n");
  });

  it("adds anchors to headings and a toc covering levels 1 to 3 only", () => {
    const html = convertMdToHtml("[[toc]]\n\n# One\n\n## Two\n\n### Three\n\n#### Four");
    expect(html).toContain(
      '<div class="table-of-contents"><ul><li><a href="#one">One</a><ul><li><a href="#two">Two</a><ul><li><a href="#three">Three</a></li></ul></li></ul></li></ul></div>',
    );
    expect(html).toContain('<h1 id="one" tabindex="-1"><a class="header-anchor" href="#one">One</a></h1>');
    expect(html).toContain('<h4 id="four" tabindex="-1"><a class="header-anchor" href="#four">Four</a></h4>');
    expect(html).not.toContain('href="#four">Four</a></li>');
  });

  it("renders emoji, sub, sup and mark", () => {
    expect(convertMdToHtml(":smile: H~2~O 2^10^ ==m==")).toBe(
      "<p>😄 H<sub>2</sub>O 2<sup>10</sup> <mark>m</mark></p>\n",
    );
  });

  it("renders footnotes", () => {
    const html = convertMdToHtml("x[^1]\n\n[^1]: note");
    expect(html).toContain('<sup class="footnote-ref"><a href="#fn1" id="fnref1">[1]</a></sup>');
    expect(html).toContain('<section class="footnotes">');
  });

  it("renders definition lists", () => {
    expect(convertMdToHtml("Term\n: Def")).toBe("<dl>\n<dt>Term</dt>\n<dd>Def</dd>\n</dl>\n");
  });

  it("renders the custom video and podcast players", () => {
    expect(convertMdToHtml('::video[src="abc"]::')).toContain('src="https://www.youtube.com/embed/abc"');
    expect(convertMdToHtml('::podcast[src="ep1"]::')).toContain(
      'src="https://open.spotify.com/embed/episode/ep1?utm_source=generator?utm_source=generator"',
    );
  });

  it("renders blockquotes and external links with the custom rules", () => {
    expect(convertMdToHtml("> q")).toContain('<div class="custom-blockquote"');
    expect(convertMdToHtml("[l](https://x.com)")).toBe('<p><a href="https://x.com" target="_blank">l</a></p>\n');
  });

  it("detects possible math by the $ delimiter", () => {
    expect(mayContainMath("costs $5")).toBe(true);
    expect(mayContainMath("no math")).toBe(false);
  });
});

// ===========================================================================
// Code highlighting
// ===========================================================================
describe("code highlighting — mutation killing", () => {
  afterEach(() => {
    initHighlighter(undefined);
  });

  it("falls back to markdown-it's own escaping when no highlighter is set", () => {
    initHighlighter(undefined);
    expect(convertMdToHtml("```js\nconst a = 1;\n```")).toBe(
      '<pre><code class="language-js">const a = 1;\n</code></pre>\n',
    );
  });

  it("uses the highlighter with the language, theme and a copy-button transformer", () => {
    const hl = makeHighlighter();
    initHighlighter(hl);
    const html = convertMdToHtml("```js\nconst a = 1;\n```", "github-light");
    expect(html).toBe('<pre class="hl" data-lang="js" data-theme="github-light">const a = 1;\n</pre>\n');
    expect(hl.calls).toHaveLength(1);
    expect(hl.calls[0].str).toBe("const a = 1;\n");
    expect(hl.calls[0].opts.lang).toBe("js");
    expect(hl.calls[0].opts.theme).toBe("github-light");
    expect(hl.calls[0].opts.transformers).toHaveLength(1);
    expect(hl.calls[0].opts.transformers[0].name).toBeTruthy();
  });

  it("retries with an empty language when the highlighter rejects the language", () => {
    const hl = makeHighlighter(true);
    initHighlighter(hl);
    const html = convertMdToHtml("```nosuch\nx\n```", "nord");
    expect(html).toBe('<pre class="hl" data-lang="" data-theme="nord">x\n</pre>\n');
    expect(hl.calls).toHaveLength(2);
    expect(hl.calls[1].opts.lang).toBe("");
    expect(hl.calls[1].opts.theme).toBe("nord");
    expect(hl.calls[1].opts.transformers).toHaveLength(1);
  });

  it("passes the summary code theme through convertLoSummaryToHtml", () => {
    const hl = makeHighlighter();
    initHighlighter(hl);
    const lo = makeLo("note", { summary: "```py\np\n```" });
    convertLoSummaryToHtml(lo, "dracula");
    expect(lo.summary).toBe('<pre class="hl" data-lang="py" data-theme="dracula">p\n</pre>\n');
  });
});

// ===========================================================================
// convertLabToHtml / convertNoteToHtml
// ===========================================================================
describe("convertLabToHtml — mutation killing", () => {
  it("converts each step, rewriting image paths and linking to the lab", () => {
    const course = makeCourse();
    const step = { contentMd: "![i](img/a.png)", type: "x" } as any;
    const lab = makeLo("lab", { route: "/lab/c1/topic/lab1", los: [step] });
    convertLabToHtml(course, lab, "http://");
    expect(step.contentMd).toBe("![i](http://host.com/c1/topic/lab1/img/a.png)");
    expect(step.contentHtml).toBe('<p><img src="http://host.com/c1/topic/lab1/img/a.png" alt="i"></p>\n');
    expect(step.parentLo).toBe(lab);
    expect(step.type).toBe("step");
  });

  it("leaves step markdown alone when the course has no url", () => {
    const course = makeCourse({ courseUrl: "" });
    const step = { contentMd: "![i](img/a.png)" } as any;
    const lab = makeLo("lab", { route: "/lab/c1/lab1", los: [step] });
    convertLabToHtml(course, lab);
    expect(step.contentMd).toBe("![i](img/a.png)");
    expect(step.contentHtml).toBe('<p><img src="img/a.png" alt="i"></p>\n');
  });

  it("tolerates a lab without steps", () => {
    const lab = makeLo("lab", { los: undefined });
    expect(() => convertLabToHtml(makeCourse(), lab)).not.toThrow();
    expect(lab.contentHtml).toBeUndefined();
  });
});

describe("convertNoteToHtml — mutation killing", () => {
  it("rewrites relative image paths using the course url", () => {
    const note = makeLo("note", { route: "/note/c1/t/n1", contentMd: "![i](img/a.png)" });
    convertNoteToHtml(makeCourse(), note);
    expect(note.contentMd).toBe("![i](https://host.com/c1/t/n1/img/a.png)");
    expect(note.contentHtml).toBe('<p><img src="https://host.com/c1/t/n1/img/a.png" alt="i"></p>\n');
  });

  it("does not rewrite paths when the course has no url", () => {
    const note = makeLo("note", { route: "/note/c1/n1", contentMd: "![i](img/a.png)" });
    convertNoteToHtml(makeCourse({ courseUrl: undefined }), note);
    expect(note.contentMd).toBe("![i](img/a.png)");
    expect(note.contentHtml).toBe('<p><img src="img/a.png" alt="i"></p>\n');
  });
});

// ===========================================================================
// convertLoSummaryToHtml / convertLoToHtml
// ===========================================================================
describe("convertLoSummaryToHtml — mutation killing", () => {
  it("converts a present summary", () => {
    const lo = makeLo("note", { summary: "**bold**" });
    convertLoSummaryToHtml(lo);
    expect(lo.summary).toBe("<p><strong>bold</strong></p>\n");
  });

  it("leaves a missing summary missing", () => {
    const lo = makeLo("note", { summary: undefined });
    expect(() => convertLoSummaryToHtml(lo)).not.toThrow();
    expect(lo.summary).toBeUndefined();
  });
});

describe("convertLoToHtml — mutation killing", () => {
  it("converts the summary of every lo", () => {
    const lo = makeLo("web", { summary: "*s*" });
    convertLoToHtml(makeCourse(), lo);
    expect(lo.summary).toBe("<p><em>s</em></p>\n");
  });

  it("converts lab steps rather than the lab body", () => {
    const step = { contentMd: "step *one*" } as any;
    const lab = makeLo("lab", { los: [step], contentMd: "body" });
    convertLoToHtml(makeCourse(), lab);
    expect(step.contentHtml).toBe("<p>step <em>one</em></p>\n");
    expect(step.type).toBe("step");
    expect(lab.contentHtml).toBeUndefined();
  });

  it("converts a note even when its body is empty", () => {
    const note = makeLo("note", { contentMd: "" });
    convertLoToHtml(makeCourse(), note);
    expect(note.contentHtml).toBe("");
  });

  it("converts a note body with the given protocol", () => {
    const note = makeLo("note", { route: "/note/c1/n", contentMd: "![i](img/a.png)" });
    convertLoToHtml(makeCourse(), note, "http://");
    expect(note.contentHtml).toBe('<p><img src="http://host.com/c1/n/img/a.png" alt="i"></p>\n');
  });

  it("skips a marp talk", () => {
    const talk = makeLo("talk", { contentMd: "# Slide", frontMatter: { marp: true } });
    convertLoToHtml(makeCourse(), talk);
    expect(talk.contentHtml).toBeUndefined();
  });

  it("converts a talk that is not marp, including one with no front matter", () => {
    const talk = makeLo("talk", { contentMd: "*t*", frontMatter: undefined });
    convertLoToHtml(makeCourse(), talk);
    expect(talk.contentHtml).toBe("<p><em>t</em></p>\n");
  });

  it("converts a non-talk even when it has marp front matter", () => {
    const web = makeLo("web", { contentMd: "*w*", frontMatter: { marp: true } });
    convertLoToHtml(makeCourse(), web);
    expect(web.contentHtml).toBe("<p><em>w</em></p>\n");
  });

  it("leaves contentHtml untouched when a non-note body is empty", () => {
    const web = makeLo("web", { contentMd: "", contentHtml: "prev" });
    convertLoToHtml(makeCourse(), web);
    expect(web.contentHtml).toBe("prev");
  });

  it("rewrites relative paths for other types using the course url", () => {
    const web = makeLo("web", { route: "/web/c1/t/w", contentMd: "![i](img/a.png)" });
    convertLoToHtml(makeCourse(), web, "http://");
    expect(web.contentHtml).toBe('<p><img src="http://host.com/c1/t/w/img/a.png" alt="i"></p>\n');
  });

  it("does not rewrite paths for other types when the course has no url", () => {
    const web = makeLo("web", { route: "/web/c1/w", contentMd: "![i](img/a.png)" });
    convertLoToHtml(makeCourse({ courseUrl: "" }), web);
    expect(web.contentHtml).toBe('<p><img src="img/a.png" alt="i"></p>\n');
  });
});
