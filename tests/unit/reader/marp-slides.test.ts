// @vitest-environment jsdom
// jsdom parses foreignObject content as browsers do and runs inline event handlers, so a marker that
// stays unset after its event fires proves the handler never reached the mounted slide.
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { renderMarpSlides } from "../../../packages/svelte/course/src/markdown/services/marp-renderer";
import { marpSlideElements } from "../../../packages/svelte/ui-components/src/learning-objects/content/talk/marp-slides";

const marker = "document.body.dataset.marpMarker='ran'";

/** Mounts each slide as TalkMarp's {@html} block does. */
function mount(slides: string[]): HTMLElement[] {
  return slides.map((slide) => {
    const stage = document.createElement("div");
    stage.className = "marp-slides";
    stage.innerHTML = slide;
    document.body.appendChild(stage);
    return stage;
  });
}

async function mountDeck(markdown: string): Promise<HTMLElement[]> {
  const { html } = await renderMarpSlides(`---\nmarp: true\n---\n\n${markdown}\n`);
  return mount(marpSlideElements(html));
}

function attributeValues(root: Element): string[] {
  return [...root.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((attr) => `${attr.name}=${attr.value}`));
}

describe("marpSlideElements", () => {
  beforeAll(() => renderMarpSlides(""), 120_000);
  beforeEach(() => {
    document.body.innerHTML = "";
    delete document.body.dataset.marpMarker;
  });

  it("drops every event attribute from Marp's output, so firing the events runs nothing", async () => {
    const [slide] = await mountDeck(
      [
        `<img src="missing.png" onerror="${marker}">`,
        `<button onclick="${marker}">press</button>`,
        `<div onmouseover="${marker}">hover</div>`,
        `<svg onload="${marker}"><circle r="1" onclick="${marker}"/></svg>`,
        `<details open ontoggle="${marker}"><summary>more</summary></details>`
      ].join("\n\n")
    );
    expect(attributeValues(slide).filter((attr) => attr.startsWith("on"))).toEqual([]);
    for (const [selector, type] of [
      ["img", "error"],
      ["button", "click"],
      ["section div", "mouseover"],
      ["svg svg", "load"],
      ["circle", "click"],
      ["details", "toggle"]
    ]) {
      slide.querySelector(selector)?.dispatchEvent(new Event(type));
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(document.body.dataset.marpMarker).toBeUndefined();
    expect(slide.textContent).toContain("press");
  });

  it("drops executable URLs from links, images and SVG, and active embedded documents", async () => {
    const [slide] = await mountDeck(
      [
        `<a href="JaVaScRiPt:${marker}">html link</a>`,
        `<img src="javascript:${marker}" alt="bad image">`,
        `<svg><a xlink:href="javascript:${marker}"><text>svg link</text></a><a href="javascript:${marker}"><text>svg href</text></a></svg>`,
        `<object data="javascript:${marker}"></object><embed src="javascript:${marker}">`,
        `<iframe src="javascript:${marker}"></iframe><iframe srcdoc="<script>${marker}</script>"></iframe>`,
        `<form action="javascript:${marker}"><input type="submit" formaction="javascript:${marker}"></form>`,
        `<meta http-equiv="refresh" content="0;url=javascript:${marker}">`,
        `<script>${marker}</script>`
      ].join("\n\n")
    );
    expect(attributeValues(slide).filter((attr) => /javascript:/i.test(attr))).toEqual([]);
    expect(slide.querySelectorAll("script, object, embed, meta, iframe[srcdoc]")).toHaveLength(0);
    expect(slide.innerHTML).not.toContain("marpMarker");
    expect(slide.textContent).toContain("html link");
    expect(slide.textContent).toContain("svg link");
  });

  it("keeps Marp's SVG stage, code highlighting and MathJax container, and drops Marp's own inline script", async () => {
    const [slide] = await mountDeck("# Title\n\n```js\nconst a = 1;\n```\n\n$$\n\\frac{a}{b}\n$$");
    const svg = slide.querySelector(":scope > svg")!;
    expect(svg.getAttribute("data-marpit-svg")).toBe("");
    expect(svg.getAttribute("viewBox")).toBe("0 0 1280 720");
    const stage = svg.firstElementChild!;
    expect(stage.localName).toBe("foreignObject");
    expect([stage.getAttribute("width"), stage.getAttribute("height")]).toEqual(["1280", "720"]);
    expect(stage.firstElementChild?.localName).toBe("section");
    expect(stage.firstElementChild?.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    expect(slide.querySelector("pre code .hljs-keyword")?.textContent).toBe("const");
    const math = slide.querySelector("mjx-container")!;
    expect([math.getAttribute("jax"), math.getAttribute("display")]).toEqual(["SVG", "true"]);
    expect(math.querySelector("svg path[d]")).not.toBeNull();
    expect(slide.querySelectorAll("script")).toHaveLength(0);
  });

  it("rebuilds the stage from numeric attributes only, so a crafted stage attribute cannot carry markup", () => {
    const crafted =
      `<div class="marp-slides"><svg data-marpit-svg="" viewBox='0 0 1" onload="${marker}' onload="${marker}">` +
      `<foreignObject width="1280" height="720" x='1"><img src=x onerror="${marker}">' requiredExtensions="javascript:x">` +
      `<section id="1"><p>body</p></section></foreignObject><script>${marker}</script></svg></div>`;
    const [slide] = mount(marpSlideElements(crafted));
    expect(slide.innerHTML).toBe('<svg data-marpit-svg=""><foreignObject width="1280" height="720"><section id="1"><p>body</p></section></foreignObject></svg>');
  });

  it("sanitizes plain sections when the deck has no SVG stage", () => {
    const [slide] = mount(marpSlideElements(`<section><h1>Plain</h1><img src="missing.png" onerror="${marker}"></section>`));
    expect(slide.innerHTML).toBe('<section><h1>Plain</h1><img src="missing.png"></section>');
  });
});
