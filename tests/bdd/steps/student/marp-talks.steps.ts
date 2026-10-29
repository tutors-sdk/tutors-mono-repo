// @vitest-environment jsdom
// jsdom parses SVG foreignObject content as browsers do, and Vitest's jsdom runs inline event handlers,
// so a marker that stays unset proves the slide's handler is gone rather than merely not run.
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import type { Lo } from "../../../../packages/jsr/model/src/tutors.ts";
import { buildMarpMarkdown, renderMarpSlides } from "../../../../packages/svelte/course/src/markdown/services/marp-renderer.ts";
import { marpSlideElements } from "../../../../packages/svelte/ui-components/src/learning-objects/content/talk/marp-slides.ts";

const feature = await loadFeature("tests/bdd/features/student/marp-talks.feature");

const marker = "document.body.dataset.marpMarker='ran'";

describeFeature(feature, ({ Rule }) => {
  let contentMd: string;
  let slides: HTMLElement[];

  // Renders the talk as TalkMarp does, then mounts every slide the way its {@html} block does.
  const open = async () => {
    document.body.innerHTML = "";
    delete document.body.dataset.marpMarker;
    const lo = { contentMd, frontMatter: { marp: true } } as unknown as Lo;
    const { html } = await renderMarpSlides(buildMarpMarkdown(lo));
    slides = marpSlideElements(html).map((slide) => {
      const stage = document.createElement("div");
      stage.className = "marp-slides";
      stage.innerHTML = slide;
      document.body.appendChild(stage);
      return stage;
    });
  };
  const deck = (...pages: string[]) => `---\nmarp: true\n---\n\n${pages.join("\n\n---\n\n")}\n`;

  Rule(
    "If a Marp talk's slide carries an event handler attribute, a script or a javascript: URL, then the reader shall show the slide with none of them present.",
    ({ RuleScenario }) => {
      RuleScenario("An image's error handler in a slide never runs", ({ Given, When, Then, And }) => {
        Given("a Marp talk whose slide has an image with a missing source and an error handler that sets a marker", () => {
          contentMd = deck(`# Broken image\n\n<img src="missing.png" alt="missing" onerror="${marker}">`);
        });
        When("a student opens the talk", open);
        Then("the slide shows the image without its error handler", () => {
          const img = slides[0].querySelector("img");
          expect(img?.getAttribute("src")).toBe("missing.png");
          expect(img?.hasAttribute("onerror")).toBe(false);
        });
        And("the marker is still unset after the image fails to load", async () => {
          slides[0].querySelector("img")!.dispatchEvent(new Event("error"));
          await new Promise((resolve) => setTimeout(resolve, 50));
          expect(document.body.dataset.marpMarker).toBeUndefined();
        });
      });

      RuleScenario("Scripts, inline iframe documents and javascript: links are removed from a slide", ({ Given, When, Then, And }) => {
        Given("a Marp talk whose slide has a script, an iframe with an inline document, a javascript: link and an SVG javascript: link", () => {
          contentMd = deck(
            [
              "# Active content",
              `<script>${marker}</script>`,
              `<iframe srcdoc="<script>${marker}</script>"></iframe>`,
              `<a href="javascript:${marker}">html link</a>`,
              `<svg><a href="javascript:${marker}"><text>svg link</text></a></svg>`
            ].join("\n\n")
          );
        });
        When("a student opens the talk", open);
        Then("the slide holds no script, inline iframe document or javascript: URL", () => {
          const slide = slides[0];
          expect(slide.querySelectorAll("script, object, embed, iframe[srcdoc]")).toHaveLength(0);
          const urls = [...slide.querySelectorAll("*")].flatMap((el) => [...el.attributes].map((attr) => attr.value));
          expect(urls.filter((value) => /javascript:/i.test(value))).toEqual([]);
          expect(slide.innerHTML).not.toContain("marpMarker");
        });
        And("the slide still shows the text of both links", () => {
          expect(slides[0].textContent).toContain("html link");
          expect(slides[0].textContent).toContain("svg link");
        });
      });
    }
  );

  Rule(
    "The reader shall show each slide of a Marp talk inside Marp's SVG stage with its headings, images, links, highlighted code, math and Mermaid source.",
    ({ RuleScenario }) => {
      RuleScenario("A representative deck keeps its slide structure", ({ Given, When, Then, And }) => {
        Given("a Marp talk of {number} slides with a heading, an image, a link, highlighted code, math, a Mermaid diagram and a split background", () => {
          const first = [
            "# Operators",
            "![diagram](img/operators.png)",
            "[Python docs](https://docs.python.org/3/)",
            "```python\nx = 1 + 2\n```",
            "$x^2 + y^2$",
            '<div class="mermaid">graph TD; A-->B</div>'
          ].join("\n\n");
          const second = "![bg left](img/background.png)\n\n## Beside the background";
          contentMd = deck(first, second);
        });
        When("a student opens the talk", open);
        Then("the reader shows {number} slides", (_ctx, count: number) => {
          expect(slides).toHaveLength(count);
        });
        And("each slide is an SVG stage whose foreign objects hold Marp's sections", () => {
          for (const slide of slides) {
            const svg = slide.firstElementChild!;
            expect(svg.localName).toBe("svg");
            expect(svg.getAttribute("data-marpit-svg")).toBe("");
            expect(svg.getAttribute("viewBox")).toBe("0 0 1280 720");
            const stages = [...svg.children];
            expect(stages.length).toBeGreaterThan(0);
            for (const stage of stages) {
              expect(stage.localName.toLowerCase()).toBe("foreignobject");
              expect(stage.firstElementChild?.localName).toBe("section");
            }
          }
        });
        And("the first slide keeps its heading, image, link, highlighted code, math and Mermaid source", () => {
          const slide = slides[0];
          expect(slide.querySelector("h1")?.textContent).toBe("Operators");
          expect(slide.querySelector("img")?.getAttribute("src")).toBe("img/operators.png");
          expect(slide.querySelector("a")?.getAttribute("href")).toBe("https://docs.python.org/3/");
          expect(slide.querySelector("pre code .hljs-number")?.textContent).toBe("1");
          expect(slide.querySelector('mjx-container[jax="SVG"] > svg path')).not.toBeNull();
          expect(slide.querySelector("div.mermaid")?.textContent).toBe("graph TD; A-->B");
        });
        And("the second slide keeps its split background beside its content", () => {
          const sections = [...slides[1].querySelectorAll("section")];
          expect(sections.map((section) => section.getAttribute("data-marpit-advanced-background"))).toEqual(["background", "content", "pseudo"]);
          expect(sections[0].querySelector("figure")?.getAttribute("style")).toContain("img/background.png");
          expect(sections[1].querySelector("h2")?.textContent).toBe("Beside the background");
          const content = sections[1].parentElement!;
          expect([content.getAttribute("width"), content.getAttribute("x")]).toEqual(["50%", "50%"]);
        });
      });
    }
  );
});
